package com.sarcopenia.backend.metrics;

import com.sarcopenia.backend.npy.NpyArray;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;

/**
 * The single source of truth for a scan's server-derived state, computed in the
 * persist endpoint. Given the muscle masks (and the matching slices), computes
 * the best L3 slice and its metrics, and renders the preview thumbnail.
 *
 * <p>Mirrors the reference implementation in {@code web-ui/src/api/mockApi.ts}
 * ({@code derivePreview}): best slice = argmax of per-slice muscle pixel count;
 * the resampled volume is 1x1 mm in-plane, so {@code area(cm2) = pixels / 100}.
 */
@Component
public class MetricsDeriver {

    /** Default preview thumbnail edge length (px); matches the mock. */
    private static final int PREVIEW_SIZE = 96;

    /**
     * Derived per-scan metrics.
     *
     * @param sliceCount     number of axial slices (masks.shape[0])
     * @param bestSliceIndex index (0..N-1) of the max-muscle-area slice
     * @param muscleAreaCm2  that slice's muscle area in cm2
     */
    public record DerivedMetrics(int sliceCount, int bestSliceIndex, double muscleAreaCm2) {
    }

    /**
     * Compute metrics from the masks.
     */
    public DerivedMetrics deriveMetrics(NpyArray masks) {
        int[] shape = masks.shape();
        int n = shape[0];
        int sliceLen = shape[1] * shape[2];

        int bestSliceIndex = 0;
        long bestAreaPx = -1;
        for (int z = 0; z < n; z++) {
            long base = (long) z * sliceLen;
            long area = 0;
            for (int i = 0; i < sliceLen; i++) {
                area += masks.getUnsignedByte((int) (base + i));
            }
            if (area > bestAreaPx) {
                bestAreaPx = area;
                bestSliceIndex = z;
            }
        }

        // Resampled pixels are 1x1 mm, so area(cm2) = pixels / 100. Round to 2 dp.
        double muscleAreaCm2 = Math.round((bestAreaPx / 100.0) * 100.0) / 100.0;

        return new DerivedMetrics(n, bestSliceIndex, muscleAreaCm2);
    }

    /**
     * Render the preview PNG (best slice, per-slice grayscale normalisation, with a
     * translucent red mask overlay), downscaled to a {@value #PREVIEW_SIZE}px square.
     */
    public byte[] renderPreview(NpyArray slices, NpyArray masks, int bestSliceIndex) {
        int[] shape = slices.shape();
        int h = shape[1];
        int w = shape[2];
        int sliceLen = h * w;
        long base = (long) bestSliceIndex * sliceLen;

        float min = Float.POSITIVE_INFINITY;
        float max = Float.NEGATIVE_INFINITY;
        for (int i = 0; i < sliceLen; i++) {
            float v = slices.getFloat((int) (base + i));
            if (v < min) {
                min = v;
            }
            if (v > max) {
                max = v;
            }
        }
        float range = (max - min) == 0 ? 1f : (max - min);

        BufferedImage full = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int i = y * w + x;
                int g = Math.round(((slices.getFloat((int) (base + i)) - min) / range) * 255f);
                int r = g;
                int gr = g;
                int b = g;
                if (masks.getUnsignedByte((int) (base + i)) != 0) {
                    r = Math.min(255, Math.round(g * 0.4f + 215f * 0.6f));
                    gr = Math.round(g * 0.4f);
                    b = Math.round(g * 0.4f);
                }
                full.setRGB(x, y, (r << 16) | (gr << 8) | b);
            }
        }

        BufferedImage small = new BufferedImage(PREVIEW_SIZE, PREVIEW_SIZE, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2 = small.createGraphics();
        g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g2.drawImage(full, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE, null);
        g2.dispose();

        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(small, "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to render preview PNG.", e);
        }
    }
}
