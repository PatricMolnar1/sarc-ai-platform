import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Typography from "@mui/material/Typography";

import type { Patient } from "../api/types";
import { ageFromDob, formatDate, formatDateTime, sexLabel } from "../utils/format";

interface FieldProps {
  label: string;
  value: React.ReactNode;
}

function Field({ label, value }: FieldProps) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="body1">{value ?? "-"}</Typography>
    </Box>
  );
}

export default function PatientInfoTab({ patient }: { patient: Patient }) {
  const age = ageFromDob(patient.dateOfBirth);
  const bmi =
    patient.heightM && patient.weightKg
      ? (patient.weightKg / (patient.heightM * patient.heightM)).toFixed(1)
      : null;

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Demographics
      </Typography>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Field label="Date of birth" value={`${formatDate(patient.dateOfBirth)}${age !== null ? ` (${age}y)` : ""}`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Field label="Sex" value={sexLabel(patient.sex)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Field label="MRN" value={patient.mrn} />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Body composition
      </Typography>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Field label="Height" value={patient.heightM ? `${patient.heightM.toFixed(2)} m` : "-"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Field label="Weight" value={patient.weightKg ? `${patient.weightKg.toFixed(1)} kg` : "-"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Field label="BMI" value={bmi ? `${bmi} kg/m²` : "-"} />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Scan history
      </Typography>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Field label="Saved scans" value={patient.scanCount} />
        </Grid>
        <Grid size={{ xs: 6, sm: 8 }}>
          <Field label="Most recent scan" value={formatDateTime(patient.lastScanDate)} />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Clinical notes
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
        {patient.notes?.trim() || "No notes recorded."}
      </Typography>
    </Box>
  );
}
