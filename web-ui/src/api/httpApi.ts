/**
 * Real Core Backend client (Spring Boot, port 8080).
 *
 * The endpoint paths below are the UI's proposed contract; align them with the
 * Spring Boot controllers once that service is built. Until then the app runs
 * against mockApi (see config.ts / index.ts).
 */

import { CORE_API_BASE } from "./config";
import { encodeNpyFloat32, encodeNpyUint8, parseNpy } from "../utils/npy";
import type { CoreApi, MaskVolume, Page, Patient, Scan, ScanPersistInput, SliceVolume } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CORE_API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
  }
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function requestBuffer(path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${CORE_API_BASE}${path}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
  }
  return res.arrayBuffer();
}

export const httpApi: CoreApi = {
  listPatients(params = {}) {
    const query = new URLSearchParams();
    if (params.page != null) query.set("page", String(params.page));
    if (params.size != null) query.set("size", String(params.size));
    if (params.sort) query.set("sort", params.sort);
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return request<Page<Patient>>(`/api/patients${qs ? `?${qs}` : ""}`);
  },

  getPatient(patientId) {
    return request<Patient>(`/api/patients/${encodeURIComponent(patientId)}`);
  },

  createPatient(input) {
    return request<Patient>("/api/patients", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listScans(patientId) {
    return request<Scan[]>(`/api/patients/${encodeURIComponent(patientId)}/scans`);
  },

  deleteScan(patientId, scanId) {
    return request<void>(
      `/api/patients/${encodeURIComponent(patientId)}/scans/${encodeURIComponent(scanId)}`,
      { method: "DELETE" },
    );
  },

  async getScanSlices(patientId, scanId): Promise<SliceVolume> {
    const buf = await requestBuffer(
      `/api/patients/${encodeURIComponent(patientId)}/scans/${encodeURIComponent(scanId)}/slices.npy`,
    );
    const arr = parseNpy(buf);
    return { shape: arr.shape as [number, number, number], data: arr.data as Float32Array };
  },

  async getScanMasks(patientId, scanId): Promise<MaskVolume> {
    const buf = await requestBuffer(
      `/api/patients/${encodeURIComponent(patientId)}/scans/${encodeURIComponent(scanId)}/masks.npy`,
    );
    const arr = parseNpy(buf);
    return { shape: arr.shape as [number, number, number], data: arr.data as Uint8Array };
  },

  async persistScan(patientId, scanId, input: ScanPersistInput): Promise<Scan> {
    const { slices, masks, ...meta } = input;
    const form = new FormData();
    form.append("meta", new Blob([JSON.stringify(meta)], { type: "application/json" }));
    if (slices) {
      form.append(
        "slices",
        new Blob([encodeNpyFloat32(slices.shape, slices.data)], { type: "application/octet-stream" }),
        "slices.npy",
      );
    }
    if (masks) {
      form.append(
        "masks",
        new Blob([encodeNpyUint8(masks.shape, masks.data)], { type: "application/octet-stream" }),
        "masks.npy",
      );
    }
    // No explicit Content-Type; the browser sets the multipart boundary itself.
    const res = await fetch(
      `${CORE_API_BASE}/api/patients/${encodeURIComponent(patientId)}/scans/${encodeURIComponent(scanId)}`,
      { method: "PUT", body: form },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
    }
    return (await res.json()) as Scan;
  },
};
