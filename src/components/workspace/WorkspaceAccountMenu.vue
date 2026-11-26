<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Box, Button, Text } from '@fastrd/ui-vue'
const emit = defineEmits<{ project: []; help: [] }>()
const open = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
const close = () => { open.value = false }
function enter(event: PointerEvent) { if (event.pointerType === 'mouse') { clearTimeout(timer); open.value = true } }
function leave() { timer = setTimeout(close, 180) }
function blur(event: FocusEvent) { if (!(event.currentTarget as Element).contains(event.relatedTarget as Node)) close() }
function escape() { close(); document.querySelector<HTMLButtonElement>('.figure-account-trigger')?.focus() }
function outside(event: PointerEvent) { if (!(event.target as Element).closest('.figure-account-menu')) close() }
function focusItem(last = false) { requestAnimationFrame(() => { const items = document.querySelectorAll<HTMLButtonElement>('.figure-account-menu [role="menuitem"]'); items[last ? items.length - 1 : 0]?.focus() }) }
function keys(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); close(); document.querySelector<HTMLButtonElement>('.figure-account-trigger')?.focus(); return }
  const items = Array.from(document.querySelectorAll<HTMLButtonElement>('.figure-account-menu [role="menuitem"]'))
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : event.key === 'ArrowUp' ? (current + items.length - 1) % items.length : -1
  if (next >= 0) { event.preventDefault(); items[next]?.focus() }
}
function globalEscape(event: KeyboardEvent) { if (event.key === 'Escape') close() }
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', globalEscape) })
onBeforeUnmount(() => { clearTimeout(timer); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', globalEscape) })
</script>
<template>
  <Box class="figure-account-menu" @pointerenter="enter" @pointerleave="leave" @focusout="blur" @keydown.esc.stop="escape">
    <Button variant="quiet" class="figure-account-trigger" aria-label="工作空间菜单" aria-haspopup="menu" :aria-expanded="open" @click="open = true" @keydown.down.prevent="() => { open = true; focusItem() }" @keydown.up.prevent="() => { open = true; focusItem(true) }"><Text class="figure-account-avatar">F</Text></Button>
    <Box v-if="open" role="menu" aria-label="工作空间菜单" class="figure-account-popover" @keydown="keys">
      <Box class="figure-account-identity"><Text as="strong">本地工作空间</Text><Text>图件保存在当前设备</Text></Box>
      <Button role="menuitem" variant="quiet" @click="() => { close(); emit('project') }">工程管理</Button>
      <Button role="menuitem" variant="quiet" @click="() => { close(); emit('help') }">使用指南</Button>
    </Box>
  </Box>
</template>
<style scoped>
.figure-account-menu { position: relative; }
.figure-account-trigger { min-width: 40px; min-height: 40px; padding: 4px; }
.figure-account-avatar { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: var(--fastui-selected); color: var(--fastui-text); font-weight: 600; }
.figure-account-popover { position: absolute; z-index: 100; right: 0; top: 100%; width: 224px; padding: 8px; border-radius: var(--fastui-radius-panel); background: var(--fastui-surface); border: 1px solid var(--fastui-border); box-shadow: 0 12px 36px #0000001a; display: grid; gap: 4px; }
.figure-account-identity { display: grid; gap: 5px; padding: 10px 10px 14px; border-bottom: 1px solid var(--fastui-border); margin-bottom: 4px; font-size: 12px; }
.figure-account-popover > button { justify-content: flex-start; min-height: 40px; }
</style>
