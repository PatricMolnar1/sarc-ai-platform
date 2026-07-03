import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import { api } from "../api";
import type { MaskVolume, Scan, ScanPersistInput, SliceVolume } from "../api/types";
import { formatDateTime } from "../utils/format";
import SliceMaskEditor, { type SliceMaskEditorHandle } from "./SliceMaskEditor";

interface ScanViewerDialogProps {
  patientId: string;
  scan: Scan | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Views/edits a saved scan: loads its slice and mask volumes from the Core
 * Backend and hands them to the shared {@link SliceMaskEditor}. A mask edit
 * re-derives metrics and preview server-side on Save (universal persist).
 */
export default function ScanViewerDialog({ patientId, scan, open, onClose, onSaved }: ScanViewerDialogProps) {
  const editorRef = useRef<SliceMaskEditorHandle | null>(null);
  const [slices, setSlices] = useState<SliceVolume | null>(null);
  const [masks, setMasks] = useState<MaskVolume | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load both volumes whenever a scan is opened.
  useEffect(() => {
    if (!open || !scan) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDirty(false);
    setSlices(null);
    setMasks(null);
    Promise.all([api.getScanSlices(patientId, scan.id), api.getScanMasks(patientId, scan.id)])
      .then(([s, m]) => {
        if (cancelled) return;
        setSlices(s);
        setMasks(m);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, scan, patientId]);

  const handleSave = async () => {
    const editor = editorRef.current;
    if (!scan || !editor || !editor.isDirty()) return;

    // A mask edit is the only change the editor produces; attaching masks is what
    // makes the server re-derive metrics + preview.
    const input: ScanPersistInput = { masks: editor.getMasks() };

    setSaving(true);
    setError(null);
    try {
      await api.persistScan(patientId, scan.id, input);
      setDirty(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (dirty && !window.confirm("Discard unsaved edits?")) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : requestClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Scan viewer
        {scan && (
          <Typography variant="body2" color="text.secondary">
            {formatDateTime(scan.performedAt)}
          </Typography>
        )}
        <IconButton
          aria-label="close"
          onClick={requestClose}
          disabled={saving}
          sx={{ position: "absolute", right: 8, top: 8, color: "grey.500" }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading || !slices || !masks ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            {error ? null : <CircularProgress />}
          </Box>
        ) : (
          <SliceMaskEditor
            ref={editorRef}
            slices={slices}
            masks={masks}
            initialSliceIndex={scan?.bestSliceIndex ?? 0}
            onDirtyChange={setDirty}
          />
        )}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={() => editorRef.current?.revert()}
          disabled={!dirty || saving}
          startIcon={<RestartAltIcon />}
        >
          Revert
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={requestClose} disabled={saving}>
          Close
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={!dirty || saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
