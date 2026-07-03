package com.sarcopenia.backend.web;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Stable JSON envelope for a page of results. Wrapping {@link Page} ourselves
 * (rather than serialising Spring Data's {@code PageImpl}, whose JSON shape is
 * not part of its API) gives the Web UI a fixed contract; see
 * {@code Page} in web-ui/src/api/types.ts.
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }
}
