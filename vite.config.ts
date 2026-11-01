import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { harnessPlugin } from './server/harness/plugin.ts'

export default defineConfig({ plugins: [vue(), harnessPlugin()], server: { strictPort: true } })
