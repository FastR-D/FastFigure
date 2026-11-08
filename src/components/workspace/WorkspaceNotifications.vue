<script setup lang="ts">
import { inject } from 'vue'
import { Box, Disclosure, DisclosureTrigger, Heading, Icon, Text } from '../ui'
import IconButton from '../ui/IconButton.vue'
import { notificationsKey } from '../../composables/useNotifications'
const notifications = inject(notificationsKey)!
</script>

<template>
  <Teleport to="body">
    <Box class="workspace-notifications" role="region" aria-label="通知" @keydown.stop>
      <Box v-for="item in notifications.items.value" :key="item.id" class="workspace-notification" role="alert" aria-atomic="true">
        <Icon name="info" class="workspace-notification-icon" />
        <Box class="workspace-notification-content">
          <Heading :level="3">{{ item.title }}</Heading>
          <Text>{{ item.message }}</Text>
          <Disclosure><DisclosureTrigger size="xs">错误详情</DisclosureTrigger><Text class="workspace-notification-detail">{{ item.detail }}</Text></Disclosure>
        </Box>
        <IconButton icon="close" label="关闭错误通知" @click="notifications.dismiss(item.id)" />
      </Box>
    </Box>
  </Teleport>
</template>
