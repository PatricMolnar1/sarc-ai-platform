import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Web UI dev server (port 3000).
// In dev we proxy to the backends so the browser never hits CORS:
//   /core -> Spring Boot Core Backend (port 8080)
//   /ai   -> FastAPI AI Worker (port 8000), HTTP and WebSocket (/ai/ws/run/...)
// The mock layer ignores /core entirely; see src/api/config.ts.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        proxy: {
            "/core": {
                target: "http://localhost:8080",
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/core/, ""); },
            },
            "/ai": {
                target: "http://localhost:8000",
                changeOrigin: true,
                // The AI Worker streams pipeline logs over WebSocket (/ws/run/{task_id}).
                ws: true,
                rewrite: function (path) { return path.replace(/^\/ai/, ""); },
            },
        },
    },
});
