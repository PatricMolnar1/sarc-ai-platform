package com.sarcopenia.backend.scan;

import com.sarcopenia.backend.patient.Patient;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * A saved pipeline result. Created or updated only through the universal persist
 * endpoint (PUT .../scans/{scanId}). Its {@code id} is the client-generated UUID
 * the persist call is idempotent on.
 *
 * <p>Server-derived fields ({@code muscleAreaCm2}, {@code sliceCount},
 * {@code bestSliceIndex}) are recomputed whenever the persist call includes masks;
 * the client never sends them. {@code hasPreview} records whether a preview.png has
 * been rendered into storage; the {@code previewUrl} is built from it on read.
 */
@Entity
@Table(name = "scans")
public class Scan {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    /** ISO 8601 datetime the scan was performed / acquired. */
    @Column(nullable = false)
    private Instant performedAt;

    /** Total muscle cross-sectional area at L3 (cm2). */
    @Column(nullable = false)
    private double muscleAreaCm2;

    /** Number of axial slices analysed (first dimension of slices.npy). */
    @Column(nullable = false)
    private int sliceCount;

    /** Index within slices.npy (0..N-1) of the max-muscle-area slice. Nullable until masks persisted. */
    private Integer bestSliceIndex;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ScanClassification classification = ScanClassification.INDETERMINATE;

    @Column(columnDefinition = "text", nullable = false)
    private String notes = "";

    /** True once a preview.png has been rendered to storage for this scan. */
    @Column(nullable = false)
    private boolean hasPreview = false;

    protected Scan() {
    }

    public Scan(String id, Patient patient, Instant performedAt) {
        this.id = id;
        this.patient = patient;
        this.performedAt = performedAt;
    }

    public String getId() {
        return id;
    }

    public Patient getPatient() {
        return patient;
    }

    public Instant getPerformedAt() {
        return performedAt;
    }

    public void setPerformedAt(Instant performedAt) {
        this.performedAt = performedAt;
    }

    public double getMuscleAreaCm2() {
        return muscleAreaCm2;
    }

    public void setMuscleAreaCm2(double muscleAreaCm2) {
        this.muscleAreaCm2 = muscleAreaCm2;
    }

    public int getSliceCount() {
        return sliceCount;
    }

    public void setSliceCount(int sliceCount) {
        this.sliceCount = sliceCount;
    }

    public Integer getBestSliceIndex() {
        return bestSliceIndex;
    }

    public void setBestSliceIndex(Integer bestSliceIndex) {
        this.bestSliceIndex = bestSliceIndex;
    }

    public ScanClassification getClassification() {
        return classification;
    }

    public void setClassification(ScanClassification classification) {
        this.classification = classification;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public boolean isHasPreview() {
        return hasPreview;
    }

    public void setHasPreview(boolean hasPreview) {
        this.hasPreview = hasPreview;
    }
}
