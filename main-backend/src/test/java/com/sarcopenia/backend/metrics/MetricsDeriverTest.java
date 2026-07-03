package com.sarcopenia.backend.metrics;

import com.sarcopenia.backend.npy.NpyArray;
import com.sarcopenia.backend.npy.NpyReader;
import com.sarcopenia.backend.npy.NpyWriter;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class MetricsDeriverTest {

    private final MetricsDeriver deriver = new MetricsDeriver();

    private NpyArray masksWithAreas(int[] perSliceArea, int dim) {
        int n = perSliceArea.length;
        byte[] data = new byte[n * dim * dim];
        for (int z = 0; z < n; z++) {
            for (int i = 0; i < perSliceArea[z]; i++) {
                data[z * dim * dim + i] = 1;
            }
        }
        return NpyReader.parse(NpyWriter.writeUint8(new int[]{n, dim, dim}, data));
    }

    @Test
    void picksMaxAreaSliceAndComputesMetrics() {
        // Slice 2 has the most muscle pixels (10000), so bestSliceIndex is 2.
        NpyArray masks = masksWithAreas(new int[]{4000, 7000, 10000, 5000}, 256);

        var m = deriver.deriveMetrics(masks);

        assertEquals(4, m.sliceCount());
        assertEquals(2, m.bestSliceIndex());
        // 1x1 mm pixels, so cm2 = pixels / 100.
        assertEquals(100.0, m.muscleAreaCm2(), 1e-9);
    }

    @Test
    void renderPreviewProducesA96pxPng() throws IOException {
        int dim = 64;
        NpyArray masks = masksWithAreas(new int[]{100, 300}, dim);
        float[] sliceData = new float[2 * dim * dim];
        for (int i = 0; i < sliceData.length; i++) {
            sliceData[i] = (i % 7) / 6f;
        }
        NpyArray slices = NpyReader.parse(NpyWriter.writeFloat32(new int[]{2, dim, dim}, sliceData));

        byte[] png = deriver.renderPreview(slices, masks, 1);

        BufferedImage img = ImageIO.read(new ByteArrayInputStream(png));
        assertNotNull(img);
        assertEquals(96, img.getWidth());
        assertEquals(96, img.getHeight());
    }
}
