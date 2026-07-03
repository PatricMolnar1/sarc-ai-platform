package com.sarcopenia.backend.npy;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Round-trips the pure-Java .npy writer/reader against each other. */
class NpyRoundTripTest {

    @Test
    void uint8RoundTrip() {
        int[] shape = {2, 3, 4};
        byte[] data = new byte[2 * 3 * 4];
        for (int i = 0; i < data.length; i++) {
            data[i] = (byte) (i % 2);
        }

        NpyArray arr = NpyReader.parse(NpyWriter.writeUint8(shape, data));

        assertArrayEquals(shape, arr.shape());
        assertTrue(arr.isUint8());
        assertEquals(2 * 3 * 4, arr.count());
        for (int i = 0; i < data.length; i++) {
            assertEquals(data[i] & 0xFF, arr.getUnsignedByte(i));
        }
    }

    @Test
    void float32RoundTrip() {
        int[] shape = {3, 256, 256};
        float[] data = new float[3 * 256 * 256];
        for (int i = 0; i < data.length; i++) {
            data[i] = (float) Math.sin(i * 0.001);
        }

        NpyArray arr = NpyReader.parse(NpyWriter.writeFloat32(shape, data));

        assertArrayEquals(shape, arr.shape());
        assertTrue(arr.isFloat32());
        for (int i = 0; i < 1000; i++) {
            assertEquals(data[i], arr.getFloat(i), 1e-6f);
        }
    }

    @Test
    void rejectsBadMagic() {
        byte[] junk = "not a npy file at all..........".getBytes();
        org.junit.jupiter.api.Assertions.assertThrows(InvalidNpyException.class, () -> NpyReader.parse(junk));
    }
}
