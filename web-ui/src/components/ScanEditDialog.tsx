import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import { api } from "../api";
import type { Scan, ScanClassification, ScanUpdate } from "../api/types";
import { CLASSIFICATION_LABELS, isoToLocalInput, localInputToIso } from "../utils/format";

interface ScanEditDialogProps {
  patientId: string;
  scan: Scan | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Scan) => void;
}

const CLASSIFICATIONS = Object.keys(CLASSIFICATION_LABELS) as ScanClassification[];

export default function ScanEditDialog({ patientId, scan, open, onClose, onSaved }: ScanEditDialogProps) {
  const [performedAtLocal, setPerformedAtLocal] = useState("");
  const [classification, setClassification] = useState<ScanClassification>("NORMAL");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form whenever a new scan is opened for editing.
  useEffect(() => {
    if (scan) {
      setPerformedAtLocal(isoToLocalInput(scan.performedAt));
      setClassification(scan.classification);
      setNotes(scan.notes);
      setError(null);
    }
  }, [scan]);

  const handleSave = async () => {
    if (!scan) return;
    setBusy(true);
    setError(null);
    const patch: ScanUpdate = {
      performedAt: localInputToIso(performedAtLocal),
      classification,
      notes,
    };
    try {
      // Metadata-only persist: no slices/masks attached, so the server skips
      // re-derivation (no recompute, no preview regeneration).
      const updated = await api.persistScan(patientId, scan.id, patch);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit scan</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Scan date & time"
            type="datetime-local"
            value={performedAtLocal}
            onChange={(e) => setPerformedAtLocal(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="Assessment"
            select
            value={classification}
            onChange={(e) => setClassification(e.target.value as ScanClassification)}
            fullWidth
          >
            {CLASSIFICATIONS.map((c) => (
              <MenuItem key={c} value={c}>
                {CLASSIFICATION_LABELS[c]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Notes"
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
        <Button onClick={handleSave} variant="contained" disabled={busy}>
          Save changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
