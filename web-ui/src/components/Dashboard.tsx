import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRowParams,
  type GridSortModel,
} from "@mui/x-data-grid";

import { api } from "../api";
import type { Page, Patient } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { ageFromDob, formatDate, sexLabel } from "../utils/format";
import NewPatientDialog from "./NewPatientDialog";

interface DashboardProps {
  onSelectPatient: (patientId: string) => void;
}

/** Maps a grid column field to the backend Patient property for server-side sorting. */
const SORT_FIELD_MAP: Record<string, string> = {
  mrn: "mrn",
  name: "lastName",
  age: "dateOfBirth",
  sex: "sex",
  scanCount: "scanCount",
  lastScanDate: "lastScanDate",
};

const DEFAULT_SORT: GridSortModel = [{ field: "name", sort: "asc" }];

export default function Dashboard({ onSelectPatient }: DashboardProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10,
  });
  const [sortModel, setSortModel] = useState<GridSortModel>(DEFAULT_SORT);
  const [creating, setCreating] = useState(false);
  // Retain the last known total so pagination doesn't jump while a page loads.
  const [rowCount, setRowCount] = useState(0);

  // Debounce the search box and reset to the first page on a new query.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPaginationModel((prev) => ({ ...prev, page: 0 }));
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const sort = useMemo(() => {
    const entry = sortModel[0];
    if (!entry) return "lastName,asc";
    const field = SORT_FIELD_MAP[entry.field] ?? "lastName";
    let dir = entry.sort ?? "asc";
    // Age sorts inversely to date of birth (older patient = earlier DOB).
    if (entry.field === "age") dir = dir === "asc" ? "desc" : "asc";
    return `${field},${dir}`;
  }, [sortModel]);

  const { data, loading, error, reload } = useAsync<Page<Patient>>(
    () =>
      api.listPatients({
        page: paginationModel.page,
        size: paginationModel.pageSize,
        sort,
        search: debouncedSearch || undefined,
      }),
    [paginationModel.page, paginationModel.pageSize, sort, debouncedSearch],
  );

  useEffect(() => {
    if (data?.totalElements != null) setRowCount(data.totalElements);
  }, [data]);

  const handleSortModelChange = (model: GridSortModel) => {
    setSortModel(model.length ? model : DEFAULT_SORT);
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const columns: GridColDef<Patient>[] = [
    { field: "mrn", headerName: "MRN", width: 130 },
    {
      field: "name",
      headerName: "Patient",
      flex: 1,
      minWidth: 180,
      valueGetter: (_value, row) => `${row.lastName}, ${row.firstName}`,
    },
    {
      field: "age",
      headerName: "Age",
      width: 80,
      type: "number",
      valueGetter: (_value, row) => ageFromDob(row.dateOfBirth),
    },
    {
      field: "sex",
      headerName: "Sex",
      width: 100,
      valueGetter: (_value, row) => sexLabel(row.sex),
    },
    {
      field: "scanCount",
      headerName: "Scans",
      width: 90,
      type: "number",
      renderCell: (params) => <Chip size="small" label={params.value} variant="outlined" />,
    },
    {
      field: "lastScanDate",
      headerName: "Last scan",
      width: 140,
      valueFormatter: (value: string | null) => formatDate(value),
    },
  ];

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Patients
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Select a patient to view details and saved scans.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            placeholder="Search name or MRN"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Button startIcon={<RefreshIcon />} onClick={reload} disabled={loading}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            New patient
          </Button>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={reload}>Retry</Button>}>
          Failed to load patients: {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ height: 520 }}>
        <DataGrid
          rows={data?.content ?? []}
          columns={columns}
          loading={loading}
          disableColumnMenu
          disableColumnFilter
          disableRowSelectionOnClick
          onRowClick={(params: GridRowParams<Patient>) => onSelectPatient(params.row.id)}
          paginationMode="server"
          sortingMode="server"
          rowCount={rowCount}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          sortModel={sortModel}
          onSortModelChange={handleSortModelChange}
          pageSizeOptions={[10, 25, 50]}
          sx={{
            border: 0,
            "& .MuiDataGrid-row:hover": { cursor: "pointer" },
            // Suppress the blue cell/header focus outline shown on click.
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": {
              outline: "none",
            },
            "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within": {
              outline: "none",
            },
          }}
        />
      </Paper>

      <NewPatientDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          setPaginationModel((prev) => ({ ...prev, page: 0 }));
          reload();
        }}
      />
    </Stack>
  );
}
