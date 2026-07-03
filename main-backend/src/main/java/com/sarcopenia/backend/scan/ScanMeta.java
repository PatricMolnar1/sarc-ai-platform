package com.sarcopenia.backend.scan;

import java.time.Instant;

/**
 * The {@code meta} JSON part of the universal persist request (see
 * {@code ScanUpdate} in web-ui/src/api/types.ts). All fields are optional; only
 * those present are applied. Server-derived fields are never accepted here.
 */
public record ScanMeta(
        Instant performedAt,
        ScanClassification classification,
        String notes
) {
}
