package com.sarcopenia.backend.patient;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Patient record. The Core Backend owns patient identity.
 *
 * <p>{@code scanCount} and {@code lastScanDate} are denormalised summaries of the
 * patient's saved scans, maintained by {@link com.sarcopenia.backend.scan.ScanService}
 * on every persist/delete. Keeping them on the patient lets the dashboard list
 * ({@code GET /api/patients}) page over the patients table alone, without ever
 * touching the scans table.
 */
@Entity
@Table(name = "patients")
public class Patient {

    @Id
    private String id;

    /** Medical record number, the human-facing identifier. */
    @Column(nullable = false, unique = true)
    private String mrn;

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    /** ISO 8601 date (YYYY-MM-DD). */
    @Column(nullable = false)
    private LocalDate dateOfBirth;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Sex sex;

    /** Height in metres. Nullable. */
    private Double heightM;

    private Double weightKg;

    @Column(columnDefinition = "text", nullable = false)
    private String notes = "";

    /** Denormalised count of the patient's saved scans (maintained by ScanService). */
    @Column(nullable = false, columnDefinition = "bigint default 0")
    private long scanCount = 0;

    /** Denormalised {@code performedAt} of the most recent scan; null when none. */
    private Instant lastScanDate;

    protected Patient() {
    }

    public Patient(String id, String mrn, String firstName, String lastName, LocalDate dateOfBirth,
                   Sex sex, Double heightM, Double weightKg, String notes) {
        this.id = id;
        this.mrn = mrn;
        this.firstName = firstName;
        this.lastName = lastName;
        this.dateOfBirth = dateOfBirth;
        this.sex = sex;
        this.heightM = heightM;
        this.weightKg = weightKg;
        this.notes = notes == null ? "" : notes;
    }

    public String getId() {
        return id;
    }

    public String getMrn() {
        return mrn;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public LocalDate getDateOfBirth() {
        return dateOfBirth;
    }

    public Sex getSex() {
        return sex;
    }

    public Double getHeightM() {
        return heightM;
    }

    public Double getWeightKg() {
        return weightKg;
    }

    public String getNotes() {
        return notes;
    }

    public long getScanCount() {
        return scanCount;
    }

    public void setScanCount(long scanCount) {
        this.scanCount = scanCount;
    }

    public Instant getLastScanDate() {
        return lastScanDate;
    }

    public void setLastScanDate(Instant lastScanDate) {
        this.lastScanDate = lastScanDate;
    }
}
