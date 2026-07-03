import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid2";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import { api } from "../api";
import type { Patient, PatientCreateInput, Sex } from "../api/types";
import { sexLabel } from "../utils/format";

interface NewPatientDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: (created: Patient) => void;
}

const SEXES: Sex[] = ["M", "F", "OTHER"];

/** Parses an optional positive number field; returns null when empty. */
function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

export default function NewPatientDialog({ open, onClose, onSaved }: NewPatientDialogProps) {
  const [mrn, setMrn] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState<Sex>("F");
  const [heightM, setHeightM] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setMrn("");
      setFirstName("");
      setLastName("");
      setDateOfBirth("");
      setSex("F");
      setHeightM("");
      setWeightKg("");
      setNotes("");
      setError(null);
    }
  }, [open]);

  const height = parseOptionalNumber(heightM);
  const weight = parseOptionalNumber(weightKg);
  const today = new Date().toISOString().slice(0, 10);

  const heightInvalid = Number.isNaN(height) || (height !== null && height <= 0);
  const weightInvalid = Number.isNaN(weight) || (weight !== null && weight <= 0);
  const dobInvalid = dateOfBirth !== "" && dateOfBirth >= today;
  const canSave =
    mrn.trim() !== "" &&
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    dateOfBirth !== "" &&
    !dobInvalid &&
    !heightInvalid &&
    !weightInvalid;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const input: PatientCreateInput = {
      mrn: mrn.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      sex,
      heightM: height,
      weightKg: weight,
      notes: notes.trim(),
    };
    try {
      const created = await api.createPatient(input);
      onSaved(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New patient</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="MRN"
            value={mrn}
            onChange={(e) => setMrn(e.target.value)}
            required
            fullWidth
            helperText="Medical record number (must be unique)"
          />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                fullWidth
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Date of birth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
                inputProps={{ max: today }}
                error={dobInvalid}
                helperText={dobInvalid ? "Must be in the past" : " "}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Sex"
                select
                value={sex}
                onChange={(e) => setSex(e.target.value as Sex)}
                fullWidth
              >
                {SEXES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {sexLabel(s)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Height"
                type="number"
                value={heightM}
                onChange={(e) => setHeightM(e.target.value)}
                fullWidth
                error={heightInvalid}
                helperText={heightInvalid ? "Must be a positive number" : "Optional"}
                InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
                inputProps={{ step: 0.01, min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Weight"
                type="number"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                fullWidth
                error={weightInvalid}
                helperText={weightInvalid ? "Must be a positive number" : "Optional"}
                InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }}
                inputProps={{ step: 0.1, min: 0 }}
              />
            </Grid>
          </Grid>

          <TextField
            label="Clinical notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={3}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={busy || !canSave}>
          Create patient
        </Button>
      </DialogActions>
    </Dialog>
  );
}
