package com.sarcopenia.backend.patient;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Positive;

import java.time.LocalDate;

/**
 * Request body for {@code POST /api/patients}. The server generates the {@code id}
 * and the scan-summary fields ({@code scanCount}/{@code lastScanDate}) start empty;
 * {@code heightM} and {@code weightKg} are optional.
 */
public record PatientCreateRequest(
        @NotBlank String mrn,
        @NotBlank String firstName,
        @NotBlank String lastName,
        @NotNull @Past LocalDate dateOfBirth,
        @NotNull Sex sex,
        @Positive Double heightM,
        @Positive Double weightKg,
        String notes
) {
}
