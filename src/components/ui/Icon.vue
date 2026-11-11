<script setup lang="ts">
import { Svg, SvgPath } from '@fastrd/ui-vue'
defineProps<{ name: string }>()
const paths: Record<string, string> = {
  help:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01',
  creation:'m12 2 2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2ZM20 2v4M18 4h4',
  image: 'M3 3h18v18H3zM3 17l6-7 5 5 3-3 4 5M17 7h.01',
  moon: 'M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11Z',
  sun: 'M12 3V1M12 23v-2M3 12H1M23 12h-2M5 5 3 3M21 21l-2-2M5 19l-2 2M21 3l-2 2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z M7 9h10M7 13h7',
  files: 'M9 3h7l4 4v13H8V3h1Zm7 0v5h4M4 7v14M11 12h6M11 16h6',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  motion: 'm10 3 10 9-10 9V3ZM3 7h3M2 12h4M3 17h3',
  palette:
    'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4 2 2 0 0 1 1-4h3a3 3 0 0 0 3-3 9 9 0 0 0-9-7ZM7 9h.01M12 7h.01M17 9h.01M7 14h.01',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  plus: 'M12 5v14M5 12h14',
  import: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  notes: 'M5 3h11l3 3v15H5zM15 3v5h4M8 12h8M8 16h6',
  diagram: 'M8 3h8v5H8zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4',
  theme: 'm9 3 3 2 3-2 6 5-4 4-2-2v11H9V10l-2 2-4-4 6-5Z',
  chevron: 'm9 5 7 7-7 7',
  panel: 'M3 4h18v16H3zM9 4v16',
  close: 'm6 6 12 12M6 18 18 6',
  refresh: 'M20 7V3l-3 3a8 8 0 1 0 3 10M20 3h-5',
  branch: 'M6 3v12a4 4 0 0 0 4 4h2M18 3v4a5 5 0 0 1-5 5H6M4 3h4M16 3h4M12 17v4',
  edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z',
  undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
  redo: 'm15 5 5 5-5 5M20 10H10a6 6 0 0 0 0 12',
  check: 'm5 12 4 4L19 6',
  save: 'M4 3h13l4 4v14H3V3h1ZM7 3v6h10V3M7 21v-8h10v8',
  export: 'M12 15V3m-4 4 4-4 4 4M4 15v6h16v-6',
  layers: 'm12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
  cursor: 'm5 3 15 9-7 2-3 7L5 3Z',
  connect: 'M3 5h6v6H3zM15 13h6v6h-6zM9 8h9v5',
  fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
  ruler: 'M3 6h18v12H3zM7 6v5M11 6v3M15 6v5M19 6v3',
  minus: 'M5 12h14',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  book: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4Zm9 2v16',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  keyboard: 'M2 6h20v13H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h8',
  group: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M7 7h10v10H7z',
  ungroup: 'M3 3h8v8H3zM13 13h8v8h-8zM17 3h4v4M3 17v4h4',
}
</script>

<template>
  <Svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <SvgPath :d="paths[name] ?? paths.grid" />
  </Svg>
</template>

<style scoped>
svg {
  display: block;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}
</style>
