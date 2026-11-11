<script setup lang="ts">
import { computed, inject, ref, shallowRef, watch } from 'vue'
import { Text } from '@fastrd/ui-vue'
import { isNetworkError, notificationsKey } from '../../composables/useNotifications'

const props = defineProps<{ message?: string }>()
const notifications = inject(notificationsKey, undefined)
const network = computed(() => !!props.message && isNetworkError(props.message))
const element = shallowRef<HTMLElement>()
const inline = ref(false)
watch([() => props.message, element], ([message, element]) => {
  if (!message || !element) return
  // A native modal makes the rest of the document inert. Its errors belong inside it.
  inline.value = !!element.closest('dialog')
  if (network.value && !inline.value) notifications?.networkError(message)
}, { flush: 'post' })
</script>

<template>
  <Text v-if="message" v-show="inline || !network || !notifications" ref="element" role="alert" class="error-text">{{ message }}</Text>
</template>
