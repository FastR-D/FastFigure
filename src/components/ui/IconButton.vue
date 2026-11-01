<script setup lang="ts">
import { Button } from './primitives'
import Icon from './Icon.vue'
defineOptions({ inheritAttrs: false })
defineProps<{ label: string; icon: string; active?: boolean; disabled?: boolean }>()
</script>

<template>
  <Button v-bind="$attrs" variant="icon" :aria-pressed="active" :disabled="disabled" :aria-label="label" :title="label">
    <Icon :name="icon" />
  </Button>
</template>
