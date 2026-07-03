import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import UploadFileIcon from "@mui/icons-material/UploadFile";

import { api } from "../api";
import { aiApi, type PipelineComplete, type RunHandle } from "../api/aiApi";
import type { MaskVolume, ScanClassification, ScanPersistInput, SliceVolume } from "../api/types";
import { CLASSIFICATION_LABELS, localInputToIso } from "../utils/format";
import SliceMaskEditor, { type SliceMaskEditorHandle } from "./SliceMaskEditor";

interface NewScanDialogProps {
  patientId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const CLASSIFICATIONS = Object.keys(CLASSIFICATION_LABELS) as ScanClassification[];

/** Default `performedAt` for a new scan: now, as a datetime-local input value. */
function nowLocalInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

type Phase = "select" | "running" | "review";

/**
 * Drives a new scan through the full pipeline: upload a DICOM series to the AI
 * Worker, stream the run's progress logs live, fetch the resulting slice/mask
 * arrays, let the doctor review/edit, then either Save (persist to the Core
 * Backend, which re-derives metrics and preview) or Scrap (discard in memory).
 */
export default function NewScanDialog({ patientId, open, onClose, onSaved }: NewScanDialogProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [files, setFiles] = useState<File[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState<PipelineComplete | null>(null);

  const [slices, setSlices] = useState<SliceVolume | null>(null);
  const [masks, setMasks] = useState<MaskVolume | null>(null);
  const [initialIndex, setInitialIndex] = useState(0);

  const [performedAtLocal, setPerformedAtLocal] = useState(nowLocalInput);
  const [classification, setClassification] = useState<ScanClassification>("INDETERMINATE");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<SliceMaskEditorHandle | null>(null);
  const runHandleRef = useRef<RunHandle | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const cleanedRef = useRef(false);
  const activeRef = useRef(true);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, line]);
  }, []);

  // Auto-scroll the log console to the newest line.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  // Tell the worker to drop the task directory once results are in hand (or on
  // an aborted run). Best-effort and idempotent.
  const cleanupTask = useCallback(() => {
    const taskId = taskIdRef.current;
    if (!taskId || cleanedRef.current) return;
    cleanedRef.current = true;
    void aiApi.cleanup(taskId).catch(() => {
      /* worker already gone or unreachable; nothing else to do */
    });
  }, []);

  const reset = useCallback(() => {
    runHandleRef.current?.cancel();
    runHandleRef.current = null;
    setPhase("select");
    setFiles([]);
    setLogs([]);
    setError(null);
    setComplete(null);
    setSlices(null);
    setMasks(null);
    setInitialIndex(0);
    setPerformedAtLocal(nowLocalInput());
    setClassification("INDETERMINATE");
    setNotes("");
    setSaving(false);
    taskIdRef.current = null;
    cleanedRef.current = false;
  }, []);

  // Reset to a clean slate each time the dialog opens; tear down on unmount.
  useEffect(() => {
    activeRef.current = true;
    if (open) reset();
    return () => {
      activeRef.current = false;
      runHandleRef.current?.cancel();
    };
  }, [open, reset]);

  const startRun = async () => {
    if (files.length === 0) return;
    setPhase("running");
    setError(null);
    setLogs([`Uploading ${files.length} file${files.length === 1 ? "" : "s"}...`]);
    try {
      const { taskId, fileCount } = await aiApi.upload(files);
      if (!activeRef.current) return;
      taskIdRef.current = taskId;
      cleanedRef.current = false;
      appendLog(`Uploaded ${fileCount} files. Starting pipeline...`);

      runHandleRef.current = aiApi.run(taskId, {
        onLog: (msg) => activeRef.current && appendLog(msg),
        onError: (msg) => {
          if (!activeRef.current) return;
          setError(msg);
          cleanupTask();
        },
        onComplete: async (result) => {
          if (!activeRef.current) return;
          appendLog("Pipeline complete. Fetching results...");
          try {
            const [s, m] = await Promise.all([aiApi.fetchSlices(taskId), aiApi.fetchMasks(taskId)]);
            cleanupTask(); // arrays are in memory now, release worker storage
            if (!activeRef.current) return;
            setComplete(result);
            setSlices(s);
            setMasks(m);
            // Open the viewer on the worker-computed best (max-muscle-area) slice.
            setInitialIndex(result.best_slice_index);
            setPhase("review");
          } catch (err) {
            if (activeRef.current) setError(err instanceof Error ? err.message : String(err));
          }
        },
      });
    } catch (err) {
      if (activeRef.current) setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = async () => {
    const editor = editorRef.current;
    if (!slices || !masks || !editor) return;
    // A brand-new scan sends both arrays; their presence makes the server derive
    // bestSliceIndex, muscle area, and the preview.
    const input: ScanPersistInput = {
      performedAt: localInputToIso(performedAtLocal),
      classification,
      notes,
      slices: editor.getSlices(),
      masks: editor.getMasks(),
    };
    setSaving(true);
    setError(null);
    try {
      await api.persistScan(patientId, crypto.randomUUID(), input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  // Closing mid-run or pre-save aborts and cleans up; in review that means Scrap.
  const requestClose = () => {
    if (saving) return;
    if (phase === "review" && !window.confirm("Scrap this scan? The result will be discarded.")) return;
    runHandleRef.current?.cancel();
    cleanupTask();
    onClose();
  };

  const summary = complete && (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
      <Chip size="small" label={`Slices: ${complete.slice_count}`} />
      <Chip size="small" label={`Muscle area: ${complete.muscle_area.toFixed(1)} cm²`} />
      <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
        Preliminary: final metrics are computed on Save.
      </Typography>
    </Stack>
  );

  return (
    <Dialog open={open} onClose={requestClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        New scan
        <Typography variant="body2" color="text.secondary">
          {phase === "select" && "Upload a DICOM series to run the sarcopenia pipeline"}
          {phase === "running" && "Running pipeline..."}
          {phase === "review" && "Review and edit the muscle mask, then keep or scrap"}
        </Typography>
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

        {phase === "select" && (
          <Stack spacing={2} alignItems="flex-start" sx={{ py: 2 }}>
            <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
              Select DICOM files
              <input
                type="file"
                hidden
                multiple
                accept=".dcm,application/dicom"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </Button>
            <Typography variant="body2" color="text.secondary">
              {files.length === 0
                ? "No files selected."
                : `${files.length} file${files.length === 1 ? "" : "s"} selected.`}
            </Typography>
          </Stack>
        )}

        {phase === "running" && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              {!error && <CircularProgress size={20} />}
              <Typography variant="body2" color="text.secondary">
                {error ? "Pipeline stopped." : "Streaming pipeline progress from the AI Worker..."}
              </Typography>
            </Stack>
            <Box
              sx={{
                bgcolor: "#0d1117",
                color: "#c9d1d9",
                fontFamily: "monospace",
                fontSize: 13,
                p: 1.5,
                borderRadius: 1,
                height: 280,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div ref={logEndRef} />
            </Box>
          </Stack>
        )}

        {phase === "review" && slices && masks && (
          <Box>
            {summary}
            <SliceMaskEditor ref={editorRef} slices={slices} masks={masks} initialSliceIndex={initialIndex} />
            <Divider sx={{ my: 2 }} />
            <Stack spacing={2} sx={{ maxWidth: 512, mx: "auto" }}>
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
                minRows={2}
                fullWidth
              />
            </Stack>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {phase === "select" && (
          <>
            <Button onClick={requestClose}>Cancel</Button>
            <Button onClick={startRun} variant="contained" disabled={files.length === 0}>
              Run pipeline
            </Button>
          </>
        )}
        {phase === "running" && (
          <Button onClick={requestClose} color={error ? "primary" : "inherit"}>
            {error ? "Close" : "Cancel"}
          </Button>
        )}
        {phase === "review" && (
          <>
            <Button onClick={requestClose} color="error" disabled={saving}>
              Scrap
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button onClick={handleSave} variant="contained" disabled={saving}>
              {saving ? "Saving..." : "Keep & save"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
