import { useState } from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { api } from "../api";
import type { Scan } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { CLASSIFICATION_COLORS, CLASSIFICATION_LABELS, formatDateTime } from "../utils/format";
import ConfirmDialog from "./ConfirmDialog";
import NewScanDialog from "./NewScanDialog";
import ScanEditDialog from "./ScanEditDialog";
import ScanViewerDialog from "./ScanViewerDialog";

interface ScansTabProps {
  patientId: string;
}

export default function ScansTab({ patientId }: ScansTabProps) {
  const { data, loading, error, reload } = useAsync<Scan[]>(() => api.listScans(patientId), [patientId]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Scan | null>(null);
  const [viewing, setViewing] = useState<Scan | null>(null);
  const [deleting, setDeleting] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.deleteScan(patientId, deleting.id);
      setDeleting(null);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={reload}>Retry</Button>}>
        Failed to load scans: {error}
      </Alert>
    );
  }

  const scans = data ?? [];

  return (
    <Box>
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {scans.length === 0 ? "No saved scans yet" : `${scans.length} saved scan${scans.length === 1 ? "" : "s"}`}
        </Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
          New scan
        </Button>
      </Stack>

      {scans.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography color="text.secondary">
            Run the sarcopenia pipeline on a DICOM series to create the first scan.
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 64 }}>Preview</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Muscle area (cm²)</TableCell>
                <TableCell align="right">Slices</TableCell>
                <TableCell>Assessment</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {scans.map((scan) => (
                <TableRow key={scan.id} hover>
                  <TableCell>
                    <Tooltip title="View / edit scan image">
                      <Avatar
                        src={scan.previewUrl ?? undefined}
                        variant="rounded"
                        onClick={() => setViewing(scan)}
                        sx={{ width: 48, height: 48, cursor: "pointer", bgcolor: "grey.200" }}
                      >
                        <ImageSearchIcon fontSize="small" color="disabled" />
                      </Avatar>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{formatDateTime(scan.performedAt)}</TableCell>
                  <TableCell align="right">{scan.muscleAreaCm2.toFixed(1)}</TableCell>
                  <TableCell align="right">{scan.sliceCount}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={CLASSIFICATION_LABELS[scan.classification]}
                      color={CLASSIFICATION_COLORS[scan.classification]}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="View / edit scan image">
                      <IconButton size="small" onClick={() => setViewing(scan)}>
                        <ImageSearchIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit scan details">
                      <IconButton size="small" onClick={() => setEditing(scan)}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete scan">
                      <IconButton size="small" color="error" onClick={() => setDeleting(scan)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <NewScanDialog
        patientId={patientId}
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          reload();
        }}
      />

      <ScanViewerDialog
        patientId={patientId}
        scan={viewing}
        open={viewing !== null}
        onClose={() => setViewing(null)}
        onSaved={() => {
          // A mask edit re-derives metrics + preview server-side, so refresh.
          reload();
        }}
      />

      <ScanEditDialog
        patientId={patientId}
        scan={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete scan?"
        message={
          deleting
            ? `This will permanently delete the scan from ${formatDateTime(deleting.performedAt)}. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        confirmColor="error"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </Box>
  );
}
