import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    allowedHosts: ["93f8-2607-fb92-1980-34e8-9c8e-e5e0-b29a-a239.ngrok-free.app"],
  }
})
