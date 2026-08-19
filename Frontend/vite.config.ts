import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target:
          "https://func-vmis-dev-aqhbf4ghbxa2geca.centralus-01.azurewebsites.net",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
