/** @filedesc Detached finite JSON snapshots and deterministic private replay identity. */

const MAX_RESPONSE_DATA_DEPTH = 128;
const MAX_RESPONSE_DATA_NODES = 100_000;

export type FiniteJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly FiniteJsonValue[]
  | { [key: string]: FiniteJsonValue };

function cloneFiniteJson(
  value: unknown,
  active: WeakSet<object>,
  state: { nodes: number },
  depth: number,
  immutable: boolean
): FiniteJsonValue {
  state.nodes += 1;
  if (
    state.nodes > MAX_RESPONSE_DATA_NODES ||
    depth > MAX_RESPONSE_DATA_DEPTH
  ) {
    throw new TypeError("Response data exceeds the safe snapshot limit");
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Response data contains a non-finite number");
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError("Response data contains a non-JSON value");
  }
  if (active.has(value)) {
    throw new TypeError("Response data contains a cycle");
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== Object.prototype &&
    prototype !== Array.prototype &&
    prototype !== null
  ) {
    throw new TypeError("Response data contains a non-JSON object");
  }

  active.add(value);
  try {
    if (Array.isArray(value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      if (
        !lengthDescriptor ||
        !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
        typeof lengthDescriptor.value !== "number"
      ) {
        throw new TypeError("Response data contains an invalid array length");
      }
      const arrayLength = lengthDescriptor.value;
      // Every entry consumes at least one node. Refuse impossible arrays before
      // allocating keys or descriptors, even when their shape is also invalid.
      if (arrayLength > MAX_RESPONSE_DATA_NODES - state.nodes) {
        throw new TypeError("Response data exceeds the safe snapshot limit");
      }
      const ownKeys = Reflect.ownKeys(value);
      for (const key of ownKeys) {
        if (typeof key !== "string") {
          throw new TypeError("Response data contains a symbol-keyed property");
        }
        if (key === "length") continue;
        if (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= arrayLength) {
          throw new TypeError(
            "Response data contains a non-JSON array property"
          );
        }
      }
      const copy: FiniteJsonValue[] = [];
      for (let index = 0; index < arrayLength; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          !descriptor ||
          !descriptor.enumerable ||
          !Object.prototype.hasOwnProperty.call(descriptor, "value")
        ) {
          throw new TypeError(
            "Response data contains a sparse or accessor array"
          );
        }
        copy.push(
          cloneFiniteJson(descriptor.value, active, state, depth + 1, immutable)
        );
      }
      return immutable ? Object.freeze(copy) : copy;
    }

    const keys = Object.keys(value);
    if (Reflect.ownKeys(value).length !== keys.length) {
      throw new TypeError(
        "Response data objects must contain enumerable string keys only"
      );
    }
    const copy: { [key: string]: FiniteJsonValue } =
      Object.getPrototypeOf(value) === null
        ? (Object.create(null) as { [key: string]: FiniteJsonValue })
        : {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")
      ) {
        throw new TypeError("Response data contains an accessor property");
      }
      const child = cloneFiniteJson(
        descriptor.value,
        active,
        state,
        depth + 1,
        immutable
      );
      Object.defineProperty(copy, key, {
        value: child,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return immutable ? Object.freeze(copy) : copy;
  } finally {
    active.delete(value);
  }
}

export function canonicalFiniteJson(value: FiniteJsonValue): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("Response snapshot cannot be canonicalized");
    }
    return serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalFiniteJson).join(",")}]`;
  }
  const record = value as { [key: string]: FiniteJsonValue };
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalFiniteJson(record[key]!)}`)
    .join(",")}}`;
}

/** Preserve JSON data and reject accessors without invoking them. Not schema validation. */
export function snapshotFiniteJson(value: unknown, immutable = true): FiniteJsonValue {
  return cloneFiniteJson(value, new WeakSet<object>(), { nodes: 0 }, 0, immutable);
}
