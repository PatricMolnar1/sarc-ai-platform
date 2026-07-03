import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1565c0" },
    background: { default: "#f4f6f8" },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: ['"Segoe UI"', "Roboto", "Helvetica", "Arial", "sans-serif"].join(","),
  },
});
