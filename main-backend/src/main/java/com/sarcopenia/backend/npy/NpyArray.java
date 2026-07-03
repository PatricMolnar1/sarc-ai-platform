package com.sarcopenia.backend.npy;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * A decoded NumPy {@code .npy} array (C-order, version 1.0/2.0). Mirrors the
 * browser reader/writer in {@code web-ui/src/utils/npy.ts}: only the two dtypes
 * the system exchanges are supported, {@code <f4} (float32 slices) and
 * {@code |u1} (uint8 masks).
 *
 * <p>{@code data} is positioned at the start of the array payload and is
 * little-endian; accessors index into it in flat C-order.
 */
public final class NpyArray {

    private final int[] shape;
    private final String descr;
    private final ByteBuffer data;

    NpyArray(int[] shape, String descr, ByteBuffer data) {
        this.shape = shape;
        this.descr = descr;
        this.data = data.order(ByteOrder.LITTLE_ENDIAN);
    }

    public int[] shape() {
        return shape.clone();
    }

    public String descr() {
        return descr;
    }

    /** Total element count (product of the shape dimensions). */
    public long count() {
        long n = 1;
        for (int d : shape) {
            n *= d;
        }
        return n;
    }

    public boolean isFloat32() {
        return descr.endsWith("f4");
    }

    public boolean isUint8() {
        return descr.endsWith("u1");
    }

    /** Float value at flat index {@code i} (valid for {@code <f4} arrays). */
    public float getFloat(int i) {
        return data.getFloat((int) (i * 4L));
    }

    /** Unsigned-byte value (0..255) at flat index {@code i} (valid for {@code |u1} arrays). */
    public int getUnsignedByte(int i) {
        return data.get(i) & 0xFF;
    }

    /** True when {@code other} has an identical shape. */
    public boolean sameShape(NpyArray other) {
        return java.util.Arrays.equals(this.shape, other.shape);
    }
}
