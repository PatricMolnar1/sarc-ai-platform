package com.sarcopenia.backend.patient;

import com.sarcopenia.backend.web.ConflictException;
import com.sarcopenia.backend.web.NotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Read access to patient records (GET /api/patients, GET /api/patients/{id}). */
@Service
@Transactional(readOnly = true)
public class PatientService {

    private final PatientRepository patients;

    public PatientService(PatientRepository patients) {
        this.patients = patients;
    }

    /**
     * Dashboard listing: a single page over the patients table. {@code scanCount}
     * and {@code lastScanDate} are read straight off each patient (denormalised by
     * {@link com.sarcopenia.backend.scan.ScanService}), so this never touches the
     * scans table. An optional {@code search} filters by name or MRN server-side.
     */
    public Page<PatientDto> listPatients(String search, Pageable pageable) {
        Page<Patient> page = (search == null || search.isBlank())
                ? patients.findAll(pageable)
                : patients.search(search.trim(), pageable);
        return page.map(PatientDto::from);
    }

    public PatientDto getPatient(String patientId) {
        return PatientDto.from(requirePatient(patientId));
    }

    /**
     * Creates a patient with a server-generated id. The new patient has no scans,
     * so its {@code scanCount}/{@code lastScanDate} stay at their defaults until a
     * scan is persisted. MRN must be unique (409 otherwise).
     */
    @Transactional
    public PatientDto createPatient(PatientCreateRequest request) {
        if (patients.existsByMrn(request.mrn())) {
            throw new ConflictException("A patient with MRN " + request.mrn() + " already exists.");
        }
        Patient patient = new Patient(
                UUID.randomUUID().toString(), request.mrn(), request.firstName(), request.lastName(),
                request.dateOfBirth(), request.sex(), request.heightM(), request.weightKg(), request.notes());
        return PatientDto.from(patients.save(patient));
    }

    /** Loads a patient or throws {@link NotFoundException} (HTTP 404). */
    public Patient requirePatient(String patientId) {
        return patients.findById(patientId)
                .orElseThrow(() -> new NotFoundException("Patient " + patientId + " not found."));
    }
}
