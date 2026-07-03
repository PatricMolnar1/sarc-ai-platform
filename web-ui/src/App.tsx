import { useState } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

import { USE_MOCK } from "./api/config";
import Dashboard from "./components/Dashboard";
import PatientDetailDialog from "./components/PatientDetailDialog";

export default function App() {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <MonitorHeartIcon sx={{ mr: 1.5 }} />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            Sarcopenia Detection
          </Typography>
          {USE_MOCK && (
            <Chip
              size="small"
              color="warning"
              label="Mock data"
              title="The Core Backend is not connected; using the in-memory mock (VITE_USE_MOCK)."
            />
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Dashboard onSelectPatient={setSelectedPatientId} />
      </Container>

      <PatientDetailDialog
        patientId={selectedPatientId}
        open={selectedPatientId !== null}
        onClose={() => setSelectedPatientId(null)}
      />
    </Box>
  );
}
