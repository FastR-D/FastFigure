<script setup lang="ts">
import { computed, inject, watch } from 'vue'
import { Text } from './primitives'
import { isNetworkError, notificationsKey } from '../../composables/useNotifications'

const props = defineProps<{ message?: string }>()
const notifications = inject(notificationsKey, undefined)
const network = computed(() => !!props.message && isNetworkError(props.message))
watch(() => props.message, message => {
  if (message && network.value) notifications?.networkError(message)
}, { immediate: true })
</script>

<template>
  <Text v-if="message && (!network || !notifications)" role="alert" class="error-text">{{ message }}</Text>
</template>
