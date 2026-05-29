import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.BASE_URL || '/',
  build: {
    // Emit source maps as separate .map files alongside the bundle but DO NOT
    // reference them from the bundle (no //# sourceMappingURL). This keeps the
    // .map files in the build output (so CI can archive/upload them to a debug
    // bucket for manual symbolication) while preventing browsers from fetching
    // them in production. GCP Error Reporting does not auto-symbolicate web
    // source maps, so consumption of these maps is a manual lookup step.
    sourcemap: 'hidden',
  },
})
