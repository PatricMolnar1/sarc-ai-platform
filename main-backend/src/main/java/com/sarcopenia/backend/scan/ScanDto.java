package com.sarcopenia.backend.scan;

import java.time.Instant;

/**
 * Scan resource as serialised to the Web UI (see {@code Scan} in
 * web-ui/src/api/types.ts). All numeric/index fields are
 * server-derived; {@code previewUrl} is built from the stored preview.png.
 */
public record ScanDto(
        String id,
        String patientId,
        Instant performedAt,
        double muscleAreaCm2,
        int sliceCount,
        Integer bestSliceIndex,
        ScanClassification classification,
        String notes,
        String previewUrl
) {
    public static ScanDto from(Scan s, String previewUrl) {
        return new ScanDto(
                s.getId(), s.getPatient().getId(), s.getPerformedAt(),
                s.getMuscleAreaCm2(), s.getSliceCount(), s.getBestSliceIndex(),
                s.getClassification(), s.getNotes(), previewUrl);
    }
}
