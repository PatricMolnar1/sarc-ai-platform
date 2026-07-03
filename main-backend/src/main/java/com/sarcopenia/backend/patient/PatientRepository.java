package com.sarcopenia.backend.patient;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PatientRepository extends JpaRepository<Patient, String> {

    /** True when a patient already uses this (unique) MRN; guards patient creation. */
    boolean existsByMrn(String mrn);

    /** Case-insensitive substring match on first name, last name or MRN (dashboard search). */
    @Query("""
            select p from Patient p
            where lower(p.firstName) like lower(concat('%', :q, '%'))
               or lower(p.lastName)  like lower(concat('%', :q, '%'))
               or lower(p.mrn)       like lower(concat('%', :q, '%'))
            """)
    Page<Patient> search(@Param("q") String q, Pageable pageable);
}
