package com.sarcopenia.backend.patient;

import com.sarcopenia.backend.web.PageResponse;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Patient endpoints: list, view, and create. Edit and delete are not exposed. */
@RestController
@RequestMapping("/api/patients")
public class PatientController {

    private final PatientService patients;

    public PatientController(PatientService patients) {
        this.patients = patients;
    }

    /**
     * {@code GET /api/patients}: paginated dashboard listing. {@code page},
     * {@code size} and {@code sort} are the standard Spring Data query params
     * (e.g. {@code ?page=0&size=10&sort=lastName,asc}); {@code search} is an
     * optional name/MRN filter applied server-side.
     */
    @GetMapping
    public PageResponse<PatientDto> listPatients(
            @RequestParam(required = false) String search,
            @PageableDefault(size = 10, sort = {"lastName", "firstName"}) Pageable pageable) {
        return PageResponse.from(patients.listPatients(search, pageable));
    }

    /** {@code POST /api/patients}: create a patient (201). 409 on duplicate MRN. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PatientDto createPatient(@Valid @RequestBody PatientCreateRequest request) {
        return patients.createPatient(request);
    }

    /** {@code GET /api/patients/{id}}: single patient (404 if unknown). */
    @GetMapping("/{id}")
    public PatientDto getPatient(@PathVariable String id) {
        return patients.getPatient(id);
    }
}
