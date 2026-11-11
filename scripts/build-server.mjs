import { build } from 'vite'
await build({
  configFile: false,
  publicDir: false,
  build: {
    ssr: 'server/production.ts',
    outDir: 'server-dist',
    emptyOutDir: true,
    target: 'node24',
    rollupOptions: { output: { entryFileNames: 'server.mjs' } },
  },
})
