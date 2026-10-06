import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createAnalyzeHandler } from "./api/analyze.js";
import { researchApiPlugin } from "./server/devApi.js";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [react(), researchApiPlugin(createAnalyzeHandler({ env }))],
    server: { host: "0.0.0.0", port: 8000, strictPort: true },
  };
});
