/**
 * Minimal NumPy `.npy` reader/writer for the browser.
 *
 * The AI Worker and Core Backend exchange slices and masks as `.npy` arrays:
 * slices are `(N, 256, 256)` float32, masks are `(N, 256, 256)` uint8. This
 * supports just those two dtypes, C-order, version 1.0, which is enough for the
 * scan viewer/editor. Used by the real HTTP client; the mock skips it.
 *
 * Format reference: numpy/lib/format.py.
 */

const MAGIC = "\x93NUMPY";

export interface ParsedNpy {
  shape: number[];
  /** NumPy dtype descriptor, e.g. "<f4" or "|u1". */
  dtype: string;
  data: Float32Array | Uint8Array;
}

export function parseNpy(buffer: ArrayBuffer): ParsedNpy {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, 6));
  if (magic !== MAGIC) {
    throw new Error("Not a .npy file (bad magic string).");
  }

  const major = bytes[6];
  const dv = new DataView(buffer);
  let headerLen: number;
  let headerStart: number;
  if (major === 1) {
    headerLen = dv.getUint16(8, true);
    headerStart = 10;
  } else {
    // v2.0+ uses a 4-byte header length.
    headerLen = dv.getUint32(8, true);
    headerStart = 12;
  }

  const header = new TextDecoder("latin1").decode(
    bytes.subarray(headerStart, headerStart + headerLen),
  );

  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const fortran = /'fortran_order':\s*(True|False)/.exec(header)?.[1];
  const shapeRaw = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1];
  if (!descr || !fortran || shapeRaw === undefined) {
    throw new Error("Malformed .npy header.");
  }
  if (fortran === "True") {
    throw new Error("Fortran-ordered .npy arrays are not supported.");
  }

  const shape = shapeRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number);
  const count = shape.reduce((a, b) => a * b, 1);
  const dataOffset = headerStart + headerLen;

  if (/[<|=]?f4$/.test(descr)) {
    return { shape, dtype: descr, data: new Float32Array(buffer, dataOffset, count) };
  }
  if (/[<|=>]?u1$/.test(descr)) {
    return { shape, dtype: descr, data: new Uint8Array(buffer, dataOffset, count) };
  }
  throw new Error(`Unsupported .npy dtype: ${descr}`);
}

/** Serialise raw bytes to `.npy` (version 1.0, C-order) under the given dtype. */
function encodeNpy(descr: string, shape: number[], payload: Uint8Array): ArrayBuffer {
  const shapeStr = shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(", ")})`;
  let header = `{'descr': '${descr}', 'fortran_order': False, 'shape': ${shapeStr}, }`;

  // The total header (10-byte prelude + dict + trailing newline) must be a
  // multiple of 64 bytes so the data section is aligned.
  const prelude = 10;
  const pad = (64 - ((prelude + header.length + 1) % 64)) % 64;
  header += " ".repeat(pad) + "\n";

  const headerBytes = new TextEncoder().encode(header);
  const buffer = new ArrayBuffer(prelude + headerBytes.length + payload.length);
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);

  // \x93 N U M P Y
  bytes.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59], 0);
  bytes[6] = 1; // major version
  bytes[7] = 0; // minor version
  dv.setUint16(8, headerBytes.length, true);
  bytes.set(headerBytes, prelude);
  bytes.set(payload, prelude + headerBytes.length);
  return buffer;
}

/** Serialise a uint8 array (e.g. masks) to `.npy`. */
export function encodeNpyUint8(shape: number[], data: Uint8Array): ArrayBuffer {
  return encodeNpy("|u1", shape, data);
}

/** Serialise a little-endian float32 array (e.g. slices) to `.npy`. */
export function encodeNpyFloat32(shape: number[], data: Float32Array): ArrayBuffer {
  return encodeNpy("<f4", shape, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}
