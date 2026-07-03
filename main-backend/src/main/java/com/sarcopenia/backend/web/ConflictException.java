package com.sarcopenia.backend.web;

/** A request that conflicts with existing state (e.g. a duplicate unique field); HTTP 409. */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}
