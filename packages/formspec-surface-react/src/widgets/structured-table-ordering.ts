/** Generic stable ordering for authored StructuredPanel tables. */
export type StructuredTableOrderKey =
  | { path: string; kind: 'priority'; values: readonly string[] }
  | { path: string; kind: 'date-time' | 'string'; direction: 'asc' | 'desc' };
type Instant = { seconds: number; fraction: string };
type Value = string | number | Instant | undefined;
const safePath = /^(?!.*(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$))[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;
function keys(value: unknown): StructuredTableOrderKey[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const result: StructuredTableOrderKey[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const key = raw as Record<string, unknown>;
    if (typeof key.path !== 'string' || !safePath.test(key.path)) return undefined;
    const allowed = key.kind === 'priority' ? ['path', 'kind', 'values'] : ['path', 'kind', 'direction'];
    if (Object.keys(key).some(name => !allowed.includes(name))) return undefined;
    if (key.kind === 'priority') {
      if (!Array.isArray(key.values) || key.values.length === 0 ||
          key.values.some(v => typeof v !== 'string' || v.length === 0) ||
          new Set(key.values).size !== key.values.length) return undefined;
    } else if ((key.kind !== 'string' && key.kind !== 'date-time') ||
               (key.direction !== 'asc' && key.direction !== 'desc')) return undefined;
    result.push(key as unknown as StructuredTableOrderKey);
  }
  return result;
}
/** Full RFC3339 known-offset instants; leap seconds are not supported. */
function instant(value: string): Instant | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || match[8] === '-00:00') return undefined;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! || hour > 23 || minute > 59 || second > 59) return undefined;
  const zone = match[8]!;
  let offset = 0;
  if (zone.toUpperCase() !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3)), offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return undefined;
    offset = (offsetHour * 60 + offsetMinute) * (zone[0] === '-' ? -1 : 1);
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return { seconds: date.getTime() / 1000 - offset * 60, fraction: (match[7] ?? '').replace(/0+$/, '') };
}
function valueFor(raw: unknown, key: StructuredTableOrderKey): Value {
  if (typeof raw !== 'string') return undefined;
  if (key.kind === 'date-time') return instant(raw);
  if (key.kind === 'priority') {
    const rank = key.values.indexOf(raw);
    return rank < 0 ? key.values.length : rank;
  }
  return raw;
}
function compare(a: Value, b: Value): number {
  if (typeof a === 'object' && typeof b === 'object') {
    if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
    const width = Math.max(a.fraction.length, b.fraction.length);
    const left = a.fraction.padEnd(width, '0'), right = b.fraction.padEnd(width, '0');
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return a! < b! ? -1 : a! > b! ? 1 : 0;
}
/** Missing/invalid values are last in either direction; equal keys retain input order. */
export function orderStructuredTableRows<T>(
  rows: T[], orderBy: unknown, read: (row: T, path: string) => unknown,
): T[] {
  const order = keys(orderBy);
  if (!order) return rows;
  return rows.map((row, index) => ({ row, index, values: order.map(key => valueFor(read(row, key.path), key)) }))
    .sort((a, b) => {
      for (let i = 0; i < order.length; i++) {
        const left = a.values[i], right = b.values[i];
        if (left === undefined || right === undefined) {
          if (left !== right) return left === undefined ? 1 : -1;
          continue;
        }
        const comparison = compare(left, right);
        const key = order[i]!;
        if (comparison !== 0) return comparison * (key.kind !== 'priority' && key.direction === 'desc' ? -1 : 1);
      }
      return a.index - b.index;
    }).map(entry => entry.row);
}
