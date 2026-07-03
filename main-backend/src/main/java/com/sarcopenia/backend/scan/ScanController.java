package com.sarcopenia.backend.scan;

import com.sarcopenia.backend.storage.ScanFileStorage;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;

/** Scan endpoints. */
@RestController
@RequestMapping("/api/patients/{patientId}/scans")
public class ScanController {

    private final ScanService scans;

    public ScanController(ScanService scans) {
        this.scans = scans;
    }

    /** {@code GET .../scans}: saved scans, newest first (404 if patient unknown). */
    @GetMapping
    public List<ScanDto> listScans(@PathVariable String patientId) {
        return scans.listScans(patientId);
    }

    /**
     * {@code PUT .../scans/{scanId}}: universal persist (upsert). Multipart:
     * {@code meta} (JSON), optional {@code slices}/{@code masks} (octet-stream).
     */
    @PutMapping(value = "/{scanId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ScanDto persist(@PathVariable String patientId,
                           @PathVariable String scanId,
                           @RequestPart(value = "meta", required = false) ScanMeta meta,
                           @RequestPart(value = "slices", required = false) MultipartFile slices,
                           @RequestPart(value = "masks", required = false) MultipartFile masks) {
        return scans.persist(patientId, scanId, meta, bytes(slices), bytes(masks));
    }

    /** {@code DELETE .../scans/{scanId}}: 204 on success, 404 if unknown. */
    @DeleteMapping("/{scanId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteScan(@PathVariable String patientId, @PathVariable String scanId) {
        scans.deleteScan(patientId, scanId);
    }

    @GetMapping("/{scanId}/slices.npy")
    public ResponseEntity<byte[]> getSlices(@PathVariable String patientId, @PathVariable String scanId) {
        return octetStream(scans.readArtefact(patientId, scanId, ScanFileStorage.SLICES));
    }

    @GetMapping("/{scanId}/masks.npy")
    public ResponseEntity<byte[]> getMasks(@PathVariable String patientId, @PathVariable String scanId) {
        return octetStream(scans.readArtefact(patientId, scanId, ScanFileStorage.MASKS));
    }

    @GetMapping("/{scanId}/preview.png")
    public ResponseEntity<byte[]> getPreview(@PathVariable String patientId, @PathVariable String scanId) {
        byte[] png = scans.readArtefact(patientId, scanId, ScanFileStorage.PREVIEW);
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(png);
    }

    private static ResponseEntity<byte[]> octetStream(byte[] body) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).body(body);
    }

    private static byte[] bytes(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return null;
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read uploaded part " + file.getName(), e);
        }
    }
}
