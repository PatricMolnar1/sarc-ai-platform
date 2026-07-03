package com.sarcopenia.backend.npy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Minimal NumPy {@code .npy} reader (the JVM counterpart of
 * {@code web-ui/src/utils/npy.ts}). Supports C-order, version 1.0 and 2.0+,
 * dtypes {@code <f4} and {@code |u1} only, which are the formats used for
 * {@code slices.npy} and {@code masks.npy}.
 *
 * <p>Reference: numpy/lib/format.py.
 */
public final class NpyReader {

    private static final byte[] MAGIC = {(byte) 0x93, 'N', 'U', 'M', 'P', 'Y'};

    private static final Pattern DESCR = Pattern.compile("'descr':\\s*'([^']+)'");
    private static final Pattern FORTRAN = Pattern.compile("'fortran_order':\\s*(True|False)");
    private static final Pattern SHAPE = Pattern.compile("'shape':\\s*\\(([^)]*)\\)");

    private NpyReader() {
    }

    /** Read and validate a {@code .npy} stream into memory. */
    public static NpyArray read(InputStream in) throws IOException {
        byte[] all = in.readAllBytes();
        return parse(all);
    }

    public static NpyArray parse(byte[] bytes) {
        if (bytes.length < 10 || !matchesMagic(bytes)) {
            throw new InvalidNpyException("Not a .npy file (bad magic string).");
        }
        int major = bytes[6] & 0xFF;

        ByteBuffer dv = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        int headerLen;
        int headerStart;
        if (major == 1) {
            headerLen = dv.getShort(8) & 0xFFFF;
            headerStart = 10;
        } else {
            headerLen = dv.getInt(8);
            headerStart = 12;
        }

        String header = new String(bytes, headerStart, headerLen, StandardCharsets.US_ASCII);

        String descr = group(DESCR, header);
        String fortran = group(FORTRAN, header);
        String shapeRaw = group(SHAPE, header);
        if (descr == null || fortran == null || shapeRaw == null) {
            throw new InvalidNpyException("Malformed .npy header.");
        }
        if ("True".equals(fortran)) {
            throw new InvalidNpyException("Fortran-ordered .npy arrays are not supported.");
        }
        if (!(descr.endsWith("f4") || descr.endsWith("u1"))) {
            throw new InvalidNpyException("Unsupported .npy dtype: " + descr);
        }

        int[] shape = parseShape(shapeRaw);

        int elemSize = descr.endsWith("f4") ? 4 : 1;
        long count = 1;
        for (int d : shape) {
            count *= d;
        }
        long expected = (long) headerStart + headerLen + count * elemSize;
        if (bytes.length < expected) {
            throw new InvalidNpyException(
                    "Truncated .npy payload: expected " + expected + " bytes, got " + bytes.length + ".");
        }

        int dataOffset = headerStart + headerLen;
        ByteBuffer data = ByteBuffer.wrap(bytes, dataOffset, (int) (count * elemSize)).slice();
        return new NpyArray(shape, descr, data);
    }

    private static boolean matchesMagic(byte[] bytes) {
        for (int i = 0; i < MAGIC.length; i++) {
            if (bytes[i] != MAGIC[i]) {
                return false;
            }
        }
        return true;
    }

    private static int[] parseShape(String raw) {
        List<Integer> dims = new ArrayList<>();
        for (String part : raw.split(",")) {
            String t = part.trim();
            if (!t.isEmpty()) {
                dims.add(Integer.parseInt(t));
            }
        }
        int[] shape = new int[dims.size()];
        for (int i = 0; i < shape.length; i++) {
            shape[i] = dims.get(i);
        }
        return shape;
    }

    private static String group(Pattern p, String s) {
        Matcher m = p.matcher(s);
        return m.find() ? m.group(1) : null;
    }
}
