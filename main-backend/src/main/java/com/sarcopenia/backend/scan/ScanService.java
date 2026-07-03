package com.sarcopenia.backend.scan;

import com.sarcopenia.backend.config.AppProperties;
import com.sarcopenia.backend.metrics.MetricsDeriver;
import com.sarcopenia.backend.npy.NpyArray;
import com.sarcopenia.backend.npy.NpyReader;
import com.sarcopenia.backend.patient.Patient;
import com.sarcopenia.backend.patient.PatientService;
import com.sarcopenia.backend.storage.ScanFileStorage;
import com.sarcopenia.backend.web.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Scan read/write logic. The universal persist ({@link #persist}) is the single
 * write path: it stores any binary parts, and whenever masks are present
 * re-derives the authoritative metrics and preview, exactly mirroring
 * {@code web-ui/src/api/mockApi.ts}.
 */
@Service
public class ScanService {

    private final ScanRepository scans;
    private final PatientService patients;
    private final ScanFileStorage storage;
    private final MetricsDeriver metrics;
    private final String publicBasePath;

    public ScanService(ScanRepository scans, PatientService patients, ScanFileStorage storage,
                       MetricsDeriver metrics, AppProperties properties) {
        this.scans = scans;
        this.patients = patients;
        this.storage = storage;
        this.metrics = metrics;
        this.publicBasePath = stripTrailingSlash(properties.publicBasePath());
    }

    @Transactional(readOnly = true)
    public List<ScanDto> listScans(String patientId) {
        patients.requirePatient(patientId);
        return scans.findByPatientIdOrderByPerformedAtDesc(patientId).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public void deleteScan(String patientId, String scanId) {
        Scan scan = requireScan(patientId, scanId);
        Patient patient = scan.getPatient();
        scans.delete(scan);
        storage.deleteScan(scanId);
        refreshScanSummary(patient);
    }

    @Transactional(readOnly = true)
    public byte[] readArtefact(String patientId, String scanId, String fileName) {
        requireScan(patientId, scanId);
        return storage.read(scanId, fileName)
                .orElseThrow(() -> new NotFoundException(fileName + " not found for scan " + scanId + "."));
    }

    /**
     * Universal upsert (PUT .../scans/{scanId}). Idempotent on {@code scanId}.
     *
     * @param slicesBytes raw {@code slices.npy} bytes, or null when slices were unchanged
     * @param masksBytes  raw {@code masks.npy} bytes, or null when the mask was unchanged;
     *                    its presence is what triggers metric + preview re-derivation
     */
    @Transactional
    public ScanDto persist(String patientId, String scanId, ScanMeta meta,
                           byte[] slicesBytes, byte[] masksBytes) {
        Patient patient = patients.requirePatient(patientId);

        Scan scan = scans.findById(scanId).orElse(null);
        if (scan == null) {
            scan = new Scan(scanId, patient, meta != null && meta.performedAt() != null
                    ? meta.performedAt() : Instant.now());
        } else if (!scan.getPatient().getId().equals(patientId)) {
            throw new IllegalArgumentException(
                    "Scan " + scanId + " already belongs to a different patient.");
        }

        // 1. Store any binary parts received (validating masks shape == slices shape).
        NpyArray slicesArray = slicesBytes != null ? require3D(NpyReader.parse(slicesBytes), "slices") : null;
        NpyArray masksArray = masksBytes != null ? require3D(NpyReader.parse(masksBytes), "masks") : null;
        if (slicesArray != null && !slicesArray.isFloat32()) {
            throw new IllegalArgumentException("slices.npy must be float32 (<f4).");
        }
        if (masksArray != null && !masksArray.isUint8()) {
            throw new IllegalArgumentException("masks.npy must be uint8 (|u1).");
        }
        if (slicesArray != null && masksArray != null && !slicesArray.sameShape(masksArray)) {
            throw new IllegalArgumentException("masks shape must equal slices shape.");
        }
        if (slicesBytes != null) {
            storage.write(scanId, ScanFileStorage.SLICES, slicesBytes);
        }
        if (masksBytes != null) {
            storage.write(scanId, ScanFileStorage.MASKS, masksBytes);
        }

        // 2. If masks present, re-derive the authoritative state (loading stored slices
        //    when this call did not include them).
        if (masksArray != null) {
            NpyArray slicesForDerive = slicesArray;
            if (slicesForDerive == null) {
                byte[] stored = storage.read(scanId, ScanFileStorage.SLICES).orElseThrow(
                        () -> new IllegalArgumentException(
                                "masks supplied but no slices.npy is stored for scan " + scanId + "."));
                slicesForDerive = require3D(NpyReader.parse(stored), "slices");
            }
            if (!slicesForDerive.sameShape(masksArray)) {
                throw new IllegalArgumentException("masks shape must equal stored slices shape.");
            }

            var derived = metrics.deriveMetrics(masksArray);
            scan.setSliceCount(derived.sliceCount());
            scan.setBestSliceIndex(derived.bestSliceIndex());
            scan.setMuscleAreaCm2(derived.muscleAreaCm2());

            byte[] preview = metrics.renderPreview(slicesForDerive, masksArray, derived.bestSliceIndex());
            storage.write(scanId, ScanFileStorage.PREVIEW, preview);
            scan.setHasPreview(true);
        }

        // 3. Apply metadata fields.
        if (meta != null) {
            if (meta.performedAt() != null) {
                scan.setPerformedAt(meta.performedAt());
            }
            if (meta.classification() != null) {
                scan.setClassification(meta.classification());
            }
            if (meta.notes() != null) {
                scan.setNotes(meta.notes());
            }
        }

        ScanDto dto = toDto(scans.save(scan));
        refreshScanSummary(patient);
        return dto;
    }

    /**
     * Recomputes the patient's denormalised scan summary ({@code scanCount},
     * {@code lastScanDate}) from the scans table. The patient is a managed entity,
     * so the changes flush with the surrounding transaction, with no explicit save.
     * Hibernate auto-flushes the preceding insert/delete before these queries, so
     * the counts reflect this call's mutation.
     */
    private void refreshScanSummary(Patient patient) {
        patient.setScanCount(scans.countByPatientId(patient.getId()));
        patient.setLastScanDate(scans.findLastScanDate(patient.getId()).orElse(null));
    }

    private Scan requireScan(String patientId, String scanId) {
        Scan scan = scans.findById(scanId)
                .orElseThrow(() -> new NotFoundException("Scan " + scanId + " not found."));
        if (!scan.getPatient().getId().equals(patientId)) {
            throw new NotFoundException("Scan " + scanId + " not found for patient " + patientId + ".");
        }
        return scan;
    }

    private NpyArray require3D(NpyArray array, String name) {
        if (array.shape().length != 3) {
            throw new IllegalArgumentException(name + ".npy must be a 3-D (N, H, W) array.");
        }
        return array;
    }

    private ScanDto toDto(Scan scan) {
        String previewUrl = scan.isHasPreview()
                ? publicBasePath + "/api/patients/" + scan.getPatient().getId()
                  + "/scans/" + scan.getId() + "/preview.png"
                : null;
        return ScanDto.from(scan, previewUrl);
    }

    private static String stripTrailingSlash(String s) {
        if (s == null || s.isEmpty()) {
            return "";
        }
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
