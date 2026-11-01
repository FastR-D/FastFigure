<script setup lang="ts">
import { shallowRef } from 'vue'
import { useDialogFocus } from './use-dialog-focus.js'
import { Box, Panel } from './primitives'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    open: boolean
    label?: string | undefined
    labelledby?: string | undefined
    size?: 'md' | 'lg' | 'xl'
    dismissible?: boolean
  }>(),
  { label: undefined, labelledby: undefined, size: 'md', dismissible: true },
)
const emit = defineEmits<{ close: [] }>()
const surface = shallowRef<HTMLElement>()
function close(): void {
  if (props.dismissible) emit('close')
}
const { onDialogKeydown } = useDialogFocus(surface, () => props.open, close)
</script>

<template>
  <Teleport to="body">
    <Box v-if="open" class="fp-modal-backdrop" @click.self="close">
      <Panel
        ref="surface"
        v-bind="$attrs"
        class="fp-modal"
        :class="`fp-modal--${size}`"
        role="dialog"
        aria-modal="true"
        :aria-label="label"
        :aria-labelledby="labelledby"
        tabindex="-1"
        @keydown="onDialogKeydown"
      >
        <slot />
      </Panel>
    </Box>
  </Teleport>
</template>
