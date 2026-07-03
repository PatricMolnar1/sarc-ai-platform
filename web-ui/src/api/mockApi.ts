/**
 * In-memory mock of the Core Backend.
 *
 * Lets the dashboard and detail view run end-to-end before the Spring Boot
 * service exists. Mutations are kept in module state so edits/deletes persist
 * for the lifetime of the page. Swap to the real backend via VITE_USE_MOCK.
 */

import type {
  CoreApi,
  MaskVolume,
  Page,
  Patient,
  Scan,
  ScanClassification,
  ScanPersistInput,
  SliceVolume,
} from "./types";

/** Simulate network latency so loading states are exercised. */
const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

const DIM = 256;

let scanSeq = 1000;
const nextScanId = () => `scan-${++scanSeq}`;

function makeScan(
  patientId: string,
  performedAt: string,
  muscleAreaCm2: number,
  sliceCount: number,
  bestSliceIndex: number,
  classification: ScanClassification,
  notes = "",
): Scan {
  return {
    id: nextScanId(),
    patientId,
    performedAt,
    muscleAreaCm2,
    sliceCount,
    bestSliceIndex,
    classification,
    notes,
    previewUrl: null,
  };
}

const patients: Patient[] = [
  {
    id: "p-001",
    mrn: "MRN-48201",
    firstName: "Elena",
    lastName: "Popescu",
    dateOfBirth: "1948-03-12",
    sex: "F",
    heightM: 1.62,
    weightKg: 58.4,
    notes: "Post-operative follow-up. Monitoring muscle wasting after hip surgery.",
    lastScanDate: "2026-05-28T09:15:00Z",
    scanCount: 3,
  },
  {
    id: "p-002",
    mrn: "MRN-48355",
    firstName: "Mihai",
    lastName: "Ionescu",
    dateOfBirth: "1955-11-02",
    sex: "M",
    heightM: 1.78,
    weightKg: 81.0,
    notes: "Oncology patient, baseline body composition before chemotherapy.",
    lastScanDate: "2026-06-01T14:40:00Z",
    scanCount: 2,
  },
  {
    id: "p-003",
    mrn: "MRN-49011",
    firstName: "Ana",
    lastName: "Georgescu",
    dateOfBirth: "1972-07-21",
    sex: "F",
    heightM: 1.68,
    weightKg: 64.2,
    notes: "",
    lastScanDate: null,
    scanCount: 0,
  },
  {
    id: "p-004",
    mrn: "MRN-49120",
    firstName: "Gheorghe",
    lastName: "Dumitru",
    dateOfBirth: "1940-01-09",
    sex: "M",
    heightM: 1.71,
    weightKg: 67.8,
    notes: "Frailty assessment. Reduced grip strength reported by GP.",
    lastScanDate: "2026-04-19T11:05:00Z",
    scanCount: 4,
  },
];

const scansByPatient: Record<string, Scan[]> = {
  "p-001": [
    makeScan("p-001", "2026-01-14T08:30:00Z", 108.4, 5, 142, "NORMAL", "Baseline."),
    makeScan("p-001", "2026-03-22T09:00:00Z", 102.1, 5, 138, "INDETERMINATE", "Slight decline."),
    makeScan("p-001", "2026-05-28T09:15:00Z", 94.8, 5, 140, "SARCOPENIC", "Below threshold; flag for intervention."),
  ],
  "p-002": [
    makeScan("p-002", "2026-02-10T13:20:00Z", 168.9, 7, 155, "NORMAL", "Pre-treatment baseline."),
    makeScan("p-002", "2026-06-01T14:40:00Z", 160.2, 7, 151, "NORMAL", ""),
  ],
  "p-003": [],
  "p-004": [
    makeScan("p-004", "2025-09-30T10:00:00Z", 98.2, 5, 130, "INDETERMINATE", ""),
    makeScan("p-004", "2025-12-15T10:30:00Z", 93.7, 5, 129, "SARCOPENIC", ""),
    makeScan("p-004", "2026-02-20T10:45:00Z", 90.4, 5, 131, "SARCOPENIC", "Continued decline."),
    makeScan("p-004", "2026-04-19T11:05:00Z", 88.0, 5, 132, "SARCOPENIC", "Started resistance-training programme."),
  ],
};

/** Recompute denormalised patient fields after a scan mutation. */
function refreshPatientScanSummary(patientId: string): void {
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return;
  const scans = scansByPatient[patientId] ?? [];
  patient.scanCount = scans.length;
  patient.lastScanDate =
    scans.length === 0
      ? null
      : scans.reduce((latest, s) => (s.performedAt > latest ? s.performedAt : latest), scans[0].performedAt);
}

// Synthetic .npy volumes
// The mock has no real DICOM data, so it fabricates plausible-looking slices
// (an elliptical "body" with noise) and masks (two paraspinal muscle blobs)
// deterministically per scan. Doctor edits are kept in memory so they persist
// across re-opens within the session.

const editedMasks = new Map<string, Uint8Array>();

function findScan(patientId: string, scanId: string): Scan {
  const scan = (scansByPatient[patientId] ?? []).find((s) => s.id === scanId);
  if (!scan) throw new Error(`Scan ${scanId} not found.`);
  return scan;
}

/** Tiny deterministic PRNG so a scan's generated volume is stable. */
function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h || 1;
}

function generateSlices(scanId: string, n: number): Float32Array {
  const rnd = seededRandom(hashId(scanId) + 7);
  const data = new Float32Array(n * DIM * DIM);
  for (let z = 0; z < n; z++) {
    const base = z * DIM * DIM;
    for (let y = 0; y < DIM; y++) {
      for (let x = 0; x < DIM; x++) {
        const dx = (x - DIM / 2) / 120;
        const dy = (y - DIM / 2) / 105;
        const r = dx * dx + dy * dy;
        let v = r < 1 ? 0.35 + 0.3 * Math.cos(r * 3.1) : 0.04;
        v += (rnd() - 0.5) * 0.05;
        data[base + y * DIM + x] = Math.min(1, Math.max(0, v));
      }
    }
  }
  return data;
}

function generateMasks(n: number): Uint8Array {
  const data = new Uint8Array(n * DIM * DIM);
  for (let z = 0; z < n; z++) {
    const base = z * DIM * DIM;
    for (let y = 0; y < DIM; y++) {
      for (let x = 0; x < DIM; x++) {
        const left = ((x - 96) / 34) ** 2 + ((y - 150) / 26) ** 2 < 1;
        const right = ((x - 160) / 34) ** 2 + ((y - 150) / 26) ** 2 < 1;
        if (left || right) data[base + y * DIM + x] = 1;
      }
    }
  }
  return data;
}

// Preview thumbnail
// Stands in for the Core Backend's preview.png: picks the max-muscle-area slice
// (the same `bestSliceIndex` the real server derives on persist) and renders it
// as a small grayscale + red-overlay PNG data URL. Cached per scan; busted on
// persist/delete.

const previewCache = new Map<string, string>();

interface DerivedPreview {
  dataUrl: string;
  bestSliceIndex: number;
  bestAreaPx: number;
}

function derivePreview(slices: Float32Array, masks: Uint8Array, n: number, size = 96): DerivedPreview {
  // Best slice = largest muscle area.
  let bestSliceIndex = 0;
  let bestAreaPx = -1;
  for (let z = 0; z < n; z++) {
    const base = z * DIM * DIM;
    let area = 0;
    for (let i = 0; i < DIM * DIM; i++) area += masks[base + i];
    if (area > bestAreaPx) {
      bestAreaPx = area;
      bestSliceIndex = z;
    }
  }

  // Render that slice full-size, then downscale to a thumbnail.
  const base = bestSliceIndex * DIM * DIM;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < DIM * DIM; i++) {
    const v = slices[base + i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  const full = document.createElement("canvas");
  full.width = full.height = DIM;
  const fctx = full.getContext("2d")!;
  const img = fctx.createImageData(DIM, DIM);
  for (let i = 0; i < DIM * DIM; i++) {
    const g = Math.round(((slices[base + i] - min) / range) * 255);
    let r = g;
    let gr = g;
    let b = g;
    if (masks[base + i]) {
      r = Math.min(255, Math.round(g * 0.4 + 215 * 0.6));
      gr = Math.round(g * 0.4);
      b = Math.round(g * 0.4);
    }
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = gr;
    img.data[o + 2] = b;
    img.data[o + 3] = 255;
  }
  fctx.putImageData(img, 0, 0);

  const small = document.createElement("canvas");
  small.width = small.height = size;
  small.getContext("2d")!.drawImage(full, 0, 0, size, size);
  return { dataUrl: small.toDataURL("image/png"), bestSliceIndex, bestAreaPx };
}

/** Thumbnail for an already-persisted scan; renders the image, never re-derives metrics. */
function previewFor(scan: Scan): string {
  const cached = previewCache.get(scan.id);
  if (cached) return cached;
  const n = Math.max(1, scan.sliceCount);
  const masks = editedMasks.get(scan.id) ?? generateMasks(n);
  const dataUrl = derivePreview(generateSlices(scan.id, n), masks, n).dataUrl;
  previewCache.set(scan.id, dataUrl);
  return dataUrl;
}

/** Mirrors the backend's server-side search + sort + pagination over the patients table. */
function comparePatients(a: Patient, b: Patient, field: string): number {
  switch (field) {
    case "mrn":
      return a.mrn.localeCompare(b.mrn);
    case "firstName":
      return a.firstName.localeCompare(b.firstName);
    case "sex":
      return a.sex.localeCompare(b.sex);
    case "dateOfBirth":
      return a.dateOfBirth.localeCompare(b.dateOfBirth);
    case "scanCount":
      return a.scanCount - b.scanCount;
    case "lastScanDate":
      return (a.lastScanDate ?? "").localeCompare(b.lastScanDate ?? "");
    case "lastName":
    default:
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  }
}

export const mockApi: CoreApi = {
  async listPatients(params = {}): Promise<Page<Patient>> {
    await delay();
    const { page = 0, size = 10, sort = "lastName,asc", search } = params;

    let filtered = patients;
    const q = search?.trim().toLowerCase();
    if (q) {
      filtered = patients.filter((p) =>
        [p.firstName, p.lastName, p.mrn].some((field) => field.toLowerCase().includes(q)),
      );
    }

    const [sortField, sortDir = "asc"] = sort.split(",");
    const sorted = [...filtered].sort((a, b) => {
      const cmp = comparePatients(a, b, sortField);
      return sortDir === "desc" ? -cmp : cmp;
    });

    const start = page * size;
    return {
      content: sorted.slice(start, start + size).map((p) => ({ ...p })),
      page,
      size,
      totalElements: sorted.length,
      totalPages: Math.max(1, Math.ceil(sorted.length / size)),
    };
  },

  async getPatient(patientId) {
    await delay();
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) throw new Error(`Patient ${patientId} not found.`);
    return { ...patient };
  },

  async createPatient(input): Promise<Patient> {
    await delay();
    if (patients.some((p) => p.mrn === input.mrn)) {
      throw new Error(`A patient with MRN ${input.mrn} already exists.`);
    }
    const patient: Patient = { id: `p-${Date.now()}`, ...input, lastScanDate: null, scanCount: 0 };
    patients.push(patient);
    scansByPatient[patient.id] = [];
    return { ...patient };
  },

  async listScans(patientId) {
    await delay();
    const scans = scansByPatient[patientId] ?? [];
    // Newest first; attach a preview thumbnail alongside each entry (the grid
    // renders it without ever fetching the .npy arrays).
    return scans
      .map((s) => ({ ...s, previewUrl: s.previewUrl ?? previewFor(s) }))
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  },

  async deleteScan(patientId, scanId) {
    await delay();
    const scans = scansByPatient[patientId];
    if (!scans) throw new Error(`Patient ${patientId} not found.`);
    const index = scans.findIndex((s) => s.id === scanId);
    if (index === -1) throw new Error(`Scan ${scanId} not found.`);
    scans.splice(index, 1);
    refreshPatientScanSummary(patientId);
    editedMasks.delete(scanId);
    previewCache.delete(scanId);
  },

  async getScanSlices(patientId, scanId): Promise<SliceVolume> {
    await delay(500);
    const scan = findScan(patientId, scanId);
    const n = Math.max(1, scan.sliceCount);
    return { shape: [n, DIM, DIM], data: generateSlices(scanId, n) };
  },

  async getScanMasks(patientId, scanId): Promise<MaskVolume> {
    await delay(500);
    const scan = findScan(patientId, scanId);
    const n = Math.max(1, scan.sliceCount);
    const saved = editedMasks.get(scanId);
    const data = saved ? saved.slice() : generateMasks(n);
    return { shape: [n, DIM, DIM], data };
  },

  async persistScan(patientId, scanId, input: ScanPersistInput): Promise<Scan> {
    await delay();
    const scan = findScan(patientId, scanId);
    const { slices, masks, ...meta } = input;

    // Metadata fields always apply.
    Object.assign(scan, meta);

    // Presence of mask data is what triggers re-derivation, exactly the
    // contract the real Spring endpoint implements.
    if (masks) {
      editedMasks.set(scanId, masks.data.slice());
      const n = masks.shape[0];
      const sliceData = slices ? slices.data : generateSlices(scanId, n);
      const { dataUrl, bestSliceIndex, bestAreaPx } = derivePreview(sliceData, masks.data, n);

      scan.sliceCount = n;
      scan.bestSliceIndex = bestSliceIndex;
      // Resampled pixels are 1x1 mm, so area(cm2) = pixels / 100.
      scan.muscleAreaCm2 = Math.round((bestAreaPx / 100) * 100) / 100;
      scan.previewUrl = dataUrl;
      previewCache.set(scanId, dataUrl);
    }

    refreshPatientScanSummary(patientId);
    return { ...scan };
  },
};
