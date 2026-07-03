/**
 * Core Backend data contracts.
 *
 * This file is the UI's shape for patient records and saved scan results. Keep
 * it in sync with the Spring Boot DTOs.
 */

export type Sex = "M" | "F" | "OTHER";

/** One page of results from a paginated endpoint (mirrors the backend PageResponse). */
export interface Page<T> {
  content: T[];
  /** Zero-based page index. */
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Query parameters for the paginated patients listing. */
export interface PatientListParams {
  /** Zero-based page index. */
  page?: number;
  size?: number;
  /** Spring Data sort, e.g. "lastName,asc". */
  sort?: string;
  /** Name / MRN substring filter (server-side). */
  search?: string;
}

/** Doctor-facing classification of a saved scan result. */
export type ScanClassification = "NORMAL" | "SARCOPENIC" | "INDETERMINATE";

/** A patient record as listed on the dashboard and shown in the detail view. */
export interface Patient {
  id: string;
  /** Medical record number, the human-facing patient identifier. */
  mrn: string;
  firstName: string;
  lastName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  dateOfBirth: string;
  sex: Sex;
  heightM: number | null;
  weightKg: number | null;
  /** Free-text clinical notes for the doctor. */
  notes: string;
  /** ISO 8601 datetime of the most recent saved scan, or null if none. */
  lastScanDate: string | null;
  scanCount: number;
}

/** Fields the doctor supplies when creating a patient (POST /api/patients). */
export interface PatientCreateInput {
  mrn: string;
  firstName: string;
  lastName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  dateOfBirth: string;
  sex: Sex;
  heightM: number | null;
  weightKg: number | null;
  notes: string;
}

/**
 * A saved scan result (an "attachment" persisted on Save).
 * Carries the metrics produced by the AI pipeline plus the doctor's review.
 */
export interface Scan {
  id: string;
  patientId: string;
  /** ISO 8601 datetime the scan was performed / acquired. */
  performedAt: string;
  /** Total muscle cross-sectional area at L3 (cm2). */
  muscleAreaCm2: number;
  /** Number of axial slices the pipeline analysed. */
  sliceCount: number;
  /**
   * Index within slices.npy (0..N-1) of the max-muscle-area slice: the slice
   * the preview is rendered from and where the viewer opens. Recomputed by the
   * server on every persist that includes masks.
   */
  bestSliceIndex: number | null;
  classification: ScanClassification;
  notes: string;
  /**
   * Relative URL of a stored preview image (L3 slice + mask overlay), if any.
   * Served by the Core Backend's permanent file storage.
   */
  previewUrl: string | null;
}

/** Mutable fields a doctor may change when editing a saved scan. */
export interface ScanUpdate {
  performedAt?: string;
  classification?: ScanClassification;
  notes?: string;
}

/** Decoded `slices.npy`: preprocessed axial slices, `(N, 256, 256)` float32. */
export interface SliceVolume {
  shape: [number, number, number];
  data: Float32Array;
}

/** Decoded `masks.npy`: predicted muscle masks, `(N, 256, 256)` uint8 (0/1). */
export interface MaskVolume {
  shape: [number, number, number];
  data: Uint8Array;
}

/**
 * Inputs for the universal scan persist (upsert). Metadata fields come from
 * ScanUpdate; `slices` / `masks` are attached only when that binary data
 * actually changed, so a metadata-only edit transfers no arrays. Server-derived
 * fields (muscleAreaCm2, bestSliceIndex, previewUrl) are never sent; the
 * server recomputes them from `masks` whenever it is present.
 */
export interface ScanPersistInput extends ScanUpdate {
  /** Sent only when slices changed (create, or slice deletion). */
  slices?: SliceVolume;
  /** Sent only when the mask changed; its presence triggers re-derivation. */
  masks?: MaskVolume;
}

/** The set of operations the UI needs from the Core Backend. */
export interface CoreApi {
  /** Paginated dashboard listing; filtering/sorting happen server-side. */
  listPatients(params?: PatientListParams): Promise<Page<Patient>>;
  getPatient(patientId: string): Promise<Patient>;
  /** Create a patient (server generates the id). Rejects on a duplicate MRN. */
  createPatient(input: PatientCreateInput): Promise<Patient>;
  listScans(patientId: string): Promise<Scan[]>;
  deleteScan(patientId: string, scanId: string): Promise<void>;

  /** Fetch the scan's preprocessed slice volume for viewing. */
  getScanSlices(patientId: string, scanId: string): Promise<SliceVolume>;
  /** Fetch the scan's muscle mask volume for viewing/editing. */
  getScanMasks(patientId: string, scanId: string): Promise<MaskVolume>;

  /**
   * Universal upsert: the single write path for a scan, used identically for
   * the initial Save of a kept result and for later doctor edits. Idempotent on
   * `scanId`. Attach `masks` (and/or `slices`) only when that data changed;
   * their presence is what makes the server re-derive bestSliceIndex, muscle
   * area, and the preview image. Returns the authoritative Scan.
   */
  persistScan(patientId: string, scanId: string, input: ScanPersistInput): Promise<Scan>;
}
