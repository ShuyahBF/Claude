import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En développement, « /api » est relayé vers l'API locale (uvicorn server:app --port 8000)
export default defineConfig({ plugins: [react()], server: { proxy: { "/api": "http://localhost:8000" } } });
