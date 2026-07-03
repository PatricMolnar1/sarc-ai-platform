package com.sarcopenia.backend.npy;

/** Thrown when a {@code .npy} payload is malformed, truncated, or an unsupported dtype/order. */
public class InvalidNpyException extends RuntimeException {
    public InvalidNpyException(String message) {
        super(message);
    }
}
