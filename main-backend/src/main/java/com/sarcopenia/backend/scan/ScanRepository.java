package com.sarcopenia.backend.scan;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ScanRepository extends JpaRepository<Scan, String> {

    /** Saved scans for a patient, newest first (GET .../scans). */
    List<Scan> findByPatientIdOrderByPerformedAtDesc(String patientId);

    long countByPatientId(String patientId);

    /** Most recent {@code performedAt} for a patient; drives Patient.lastScanDate. */
    @org.springframework.data.jpa.repository.Query(
            "select max(s.performedAt) from Scan s where s.patient.id = :patientId")
    Optional<Instant> findLastScanDate(String patientId);
}
