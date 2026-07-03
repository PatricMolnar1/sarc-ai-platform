package com.sarcopenia.backend.web;

/** Maps to HTTP 404 via {@link GlobalExceptionHandler}. */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
