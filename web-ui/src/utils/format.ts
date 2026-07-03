import type { ScanClassification, Sex } from "../api/types";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : dateFmt.format(d);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : dateTimeFmt.format(d);
}

/** Whole-year age from an ISO date of birth. */
export function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export function sexLabel(sex: Sex): string {
  return sex === "M" ? "Male" : sex === "F" ? "Female" : "Other";
}

/** Convert an HTML <input type="datetime-local"> value to an ISO string. */
export function localInputToIso(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** Convert an ISO string to an <input type="datetime-local"> value. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Adjust to local time and trim seconds/timezone for the input.
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

export const CLASSIFICATION_LABELS: Record<ScanClassification, string> = {
  NORMAL: "Normal",
  SARCOPENIC: "Sarcopenic",
  INDETERMINATE: "Indeterminate",
};

export const CLASSIFICATION_COLORS: Record<ScanClassification, "success" | "error" | "warning"> = {
  NORMAL: "success",
  SARCOPENIC: "error",
  INDETERMINATE: "warning",
};
