package com.sarcopenia.backend.npy;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Minimal NumPy {@code .npy} writer (version 1.0, C-order), the JVM counterpart
 * of {@code encodeNpy} in {@code web-ui/src/utils/npy.ts}. Supports the two
 * dtypes the system exchanges: {@code <f4} (float32) and {@code |u1} (uint8).
 */
public final class NpyWriter {

    private NpyWriter() {
    }

    public static byte[] writeFloat32(int[] shape, float[] data) {
        ByteBuffer payload = ByteBuffer.allocate(data.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (float v : data) {
            payload.putFloat(v);
        }
        return encode("<f4", shape, payload.array());
    }

    public static byte[] writeUint8(int[] shape, byte[] data) {
        return encode("|u1", shape, data);
    }

    private static byte[] encode(String descr, int[] shape, byte[] payload) {
        StringBuilder shapeStr = new StringBuilder("(");
        for (int i = 0; i < shape.length; i++) {
            shapeStr.append(shape[i]).append(i == shape.length - 1 && shape.length == 1 ? "," : "");
            if (i < shape.length - 1) {
                shapeStr.append(", ");
            }
        }
        shapeStr.append(")");

        String header = "{'descr': '" + descr + "', 'fortran_order': False, 'shape': " + shapeStr + ", }";

        // The 10-byte prelude + dict + trailing newline must be a multiple of 64.
        int prelude = 10;
        int pad = (64 - ((prelude + header.length() + 1) % 64)) % 64;
        header += " ".repeat(pad) + "\n";

        byte[] headerBytes = header.getBytes(StandardCharsets.US_ASCII);
        ByteBuffer buf = ByteBuffer.allocate(prelude + headerBytes.length + payload.length)
                .order(ByteOrder.LITTLE_ENDIAN);
        buf.put(new byte[]{(byte) 0x93, 'N', 'U', 'M', 'P', 'Y'});
        buf.put((byte) 1); // major version
        buf.put((byte) 0); // minor version
        buf.putShort((short) headerBytes.length);
        buf.put(headerBytes);
        buf.put(payload);
        return buf.array();
    }
}
