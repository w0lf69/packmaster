import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/plugins/packmaster/app/",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/plugins/packmaster/api.php": {
        target: "https://192.168.30.20:9443",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
