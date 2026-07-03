package com.sarcopenia.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Application settings bound from the {@code app.*} keys in application.yml.
 *
 * @param storageRoot     filesystem root for permanent storage of the per-scan
 *                        {@code slices.npy}, {@code masks.npy}, and {@code preview.png}
 * @param publicBasePath  prefix prepended to {@link com.sarcopenia.backend.scan.Scan}
 *                        preview URLs so the browser can resolve them through the
 *                        Web UI's dev proxy (see the {@code /core} route in vite.config.ts)
 * @param corsAllowedOrigins comma-free single origin (or list) allowed for CORS
 * @param seedDemoData    seed the demo patients on an empty DB so the UI matches the mock
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String storageRoot,
        String publicBasePath,
        String corsAllowedOrigins,
        boolean seedDemoData
) {
}
