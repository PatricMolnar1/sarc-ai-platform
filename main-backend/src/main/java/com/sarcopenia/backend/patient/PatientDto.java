package com.sarcopenia.backend.patient;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Patient resource as serialised to the Web UI (see {@code Patient} in
 * web-ui/src/api/types.ts). {@code scanCount} and
 * {@code lastScanDate} are denormalised onto the patient (maintained by
 * {@link com.sarcopenia.backend.scan.ScanService}).
 */
public record PatientDto(
        String id,
        String mrn,
        String firstName,
        String lastName,
        LocalDate dateOfBirth,
        Sex sex,
        Double heightM,
        Double weightKg,
        String notes,
        Instant lastScanDate,
        long scanCount
) {
    public static PatientDto from(Patient p) {
        return new PatientDto(
                p.getId(), p.getMrn(), p.getFirstName(), p.getLastName(), p.getDateOfBirth(),
                p.getSex(), p.getHeightM(), p.getWeightKg(), p.getNotes(),
                p.getLastScanDate(), p.getScanCount());
    }
}
