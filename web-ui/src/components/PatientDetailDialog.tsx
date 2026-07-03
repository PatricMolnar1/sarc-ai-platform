import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";

import { api } from "../api";
import type { Patient } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import PatientInfoTab from "./PatientInfoTab";
import ScansTab from "./ScansTab";

interface PatientDetailDialogProps {
  patientId: string | null;
  open: boolean;
  onClose: () => void;
}

export default function PatientDetailDialog({ patientId, open, onClose }: PatientDetailDialogProps) {
  const [tab, setTab] = useState(0);

  const { data: patient, loading, error } = useAsync<Patient>(
    () => api.getPatient(patientId as string),
    [patientId],
    open && patientId !== null,
  );

  // Reset to the first tab whenever a new patient is opened.
  const handleClose = () => {
    setTab(0);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {patient ? (
          <Stack spacing={0.25}>
            <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
              {patient.lastName}, {patient.firstName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {patient.mrn}
            </Typography>
          </Stack>
        ) : (
          "Patient details"
        )}
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={{ position: "absolute", right: 8, top: 8, color: "grey.500" }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Details" />
        <Tab label="Saved scans" />
      </Tabs>

      <DialogContent dividers sx={{ minHeight: 360 }}>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}
        {error && <Alert severity="error">Failed to load patient: {error}</Alert>}
        {patient && !loading && (
          <>
            {tab === 0 && <PatientInfoTab patient={patient} />}
            {tab === 1 && <ScansTab patientId={patient.id} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
