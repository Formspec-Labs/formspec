/** @filedesc COSE_Sign1 decode helpers shared by Formspec signature adapters. */

export interface CoseSign1 {
  protectedHeader: Map<number, unknown>;
  protectedHeaderBytes: Uint8Array;
  unprotectedHeader: Map<number, unknown>;
  payload: Uint8Array | null;
  signature: Uint8Array;
  alg: number | null;
  kid: Uint8Array | null;
}

export class CoseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoseError';
  }
}

type CborValue =
  | number
  | Uint8Array
  | string
  | boolean
  | null
  | CborTag
  | CborValue[]
  | Map<CborValue, CborValue>;

interface CborTag {
  tag: number;
  value: CborValue;
}

export function decodeCoseSign1(bytes: Uint8Array): CoseSign1 {
  const decoder = new CborDecoder(bytes);
  const root = decoder.read();
  decoder.assertDone();

  if (!isTag(root) || root.tag !== 18) {
    throw new CoseError('value is not tagged COSE_Sign1');
  }
  if (!Array.isArray(root.value) || root.value.length !== 4) {
    throw new CoseError('COSE_Sign1 body must be a four-field array');
  }

  const [protectedValue, unprotectedValue, payloadValue, signatureValue] = root.value;
  if (!(protectedValue instanceof Uint8Array)) {
    throw new CoseError('protected header is not a byte string');
  }
  const protectedHeaderValue = new CborDecoder(protectedValue).readFully();
  if (!(protectedHeaderValue instanceof Map)) {
    throw new CoseError('protected header does not decode to a map');
  }
  if (!(unprotectedValue instanceof Map)) {
    throw new CoseError('unprotected header is not a map');
  }
  if (unprotectedValue.size !== 0) {
    throw new CoseError('unprotected header map must be empty for Formspec signatures');
  }
  const payload = payloadValue === null ? null : asBytes(payloadValue, 'payload');
  const signature = asBytes(signatureValue, 'signature');
  const alg = protectedHeaderValue.get(1);
  const kid = protectedHeaderValue.get(4);

  return {
    protectedHeader: protectedHeaderValue as Map<number, unknown>,
    protectedHeaderBytes: protectedValue,
    unprotectedHeader: unprotectedValue as Map<number, unknown>,
    payload,
    signature,
    alg: typeof alg === 'number' ? alg : null,
    kid: kid instanceof Uint8Array ? kid : null,
  };
}

export function resolvePayload(cose: CoseSign1, detachedPayload: Uint8Array): Uint8Array {
  if (cose.payload === null) {
    return detachedPayload;
  }
  if (!bytesEqual(cose.payload, detachedPayload)) {
    throw new CoseError('embedded COSE payload does not match supplied signed bytes');
  }
  return cose.payload;
}

export function sigStructureBytes(protectedHeader: Uint8Array, payload: Uint8Array): Uint8Array {
  return concatBytes(
    new Uint8Array([0x84]),
    encodeText('Signature1'),
    encodeBytes(protectedHeader),
    new Uint8Array([0x40]),
    encodeBytes(payload),
  );
}

export function protectedHeaderBytes(alg: number, kid?: Uint8Array): Uint8Array {
  const fields = kid ? 2 : 1;
  const chunks = [encodeMajorLen(5, fields), encodeInt(1), encodeInt(alg)];
  if (kid) {
    chunks.push(encodeInt(4), encodeBytes(kid));
  }
  return concatBytes(...chunks);
}

export function encodeCoseSign1(
  protectedHeader: Uint8Array,
  payload: Uint8Array | null,
  signature: Uint8Array,
): Uint8Array {
  return concatBytes(
    new Uint8Array([0xd2, 0x84]),
    encodeBytes(protectedHeader),
    new Uint8Array([0xa0]),
    payload === null ? new Uint8Array([0xf6]) : encodeBytes(payload),
    encodeBytes(signature),
  );
}

function asBytes(value: CborValue, field: string): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  throw new CoseError(`${field} is not a byte string`);
}

function isTag(value: CborValue): value is CborTag {
  return typeof value === 'object' && value !== null && 'tag' in value && 'value' in value;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return a.every((byte, index) => byte === b[index]);
}

function encodeText(text: string): Uint8Array {
  const textBytes = new TextEncoder().encode(text);
  return concatBytes(encodeMajorLen(3, textBytes.byteLength), textBytes);
}

function encodeBytes(bytes: Uint8Array): Uint8Array {
  return concatBytes(encodeMajorLen(2, bytes.byteLength), bytes);
}

function encodeInt(value: number): Uint8Array {
  if (!Number.isInteger(value)) {
    throw new CoseError('CBOR integer must be integral');
  }
  return value >= 0 ? encodeMajorLen(0, value) : encodeMajorLen(1, -1 - value);
}

function encodeMajorLen(major: number, value: number): Uint8Array {
  const header = major << 5;
  if (value <= 23) {
    return new Uint8Array([header | value]);
  }
  if (value <= 0xff) {
    return new Uint8Array([header | 24, value]);
  }
  if (value <= 0xffff) {
    return new Uint8Array([header | 25, value >> 8, value & 0xff]);
  }
  const out = new Uint8Array(5);
  out[0] = header | 26;
  new DataView(out.buffer).setUint32(1, value);
  return out;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

class CborDecoder {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readFully(): CborValue {
    const value = this.read();
    this.assertDone();
    return value;
  }

  read(): CborValue {
    const initial = this.nextByte();
    const major = initial >> 5;
    const additional = initial & 0x1f;
    switch (major) {
      case 0:
        return this.readLen(additional);
      case 1:
        return -1 - this.readLen(additional);
      case 2:
        return this.readBytes(this.readLen(additional));
      case 3:
        return new TextDecoder('utf-8', { fatal: true }).decode(
          this.readBytes(this.readLen(additional)),
        );
      case 4:
        return this.readArray(this.readLen(additional));
      case 5:
        return this.readMap(this.readLen(additional));
      case 6:
        return { tag: this.readLen(additional), value: this.read() };
      case 7:
        return this.readSimple(additional);
      default:
        throw new CoseError(`unsupported CBOR major type ${major}`);
    }
  }

  assertDone(): void {
    if (this.offset !== this.bytes.byteLength) {
      throw new CoseError('trailing bytes after CBOR value');
    }
  }

  private readLen(additional: number): number {
    if (additional <= 23) {
      return additional;
    }
    if (additional === 24) {
      return this.nextByte();
    }
    if (additional === 25) {
      return (this.nextByte() << 8) | this.nextByte();
    }
    if (additional === 26) {
      const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4);
      this.offset += 4;
      return view.getUint32(0);
    }
    throw new CoseError('indefinite or 64-bit CBOR lengths are not supported');
  }

  private readBytes(len: number): Uint8Array {
    if (this.offset + len > this.bytes.byteLength) {
      throw new CoseError('truncated CBOR byte string');
    }
    const out = this.bytes.slice(this.offset, this.offset + len);
    this.offset += len;
    return out;
  }

  private readArray(len: number): CborValue[] {
    return Array.from({ length: len }, () => this.read());
  }

  private readMap(len: number): Map<CborValue, CborValue> {
    const map = new Map<CborValue, CborValue>();
    for (let i = 0; i < len; i += 1) {
      const key = this.read();
      const value = this.read();
      if (typeof key === 'number' && map.has(key)) {
        throw new CoseError(`duplicate protected-header label ${key}`);
      }
      map.set(key, value);
    }
    return map;
  }

  private readSimple(additional: number): boolean | null {
    if (additional === 20) {
      return false;
    }
    if (additional === 21) {
      return true;
    }
    if (additional === 22) {
      return null;
    }
    throw new CoseError(`unsupported CBOR simple value ${additional}`);
  }

  private nextByte(): number {
    if (this.offset >= this.bytes.byteLength) {
      throw new CoseError('truncated CBOR value');
    }
    const byte = this.bytes[this.offset];
    this.offset += 1;
    return byte;
  }
}
