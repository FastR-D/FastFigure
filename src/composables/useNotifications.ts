import { ref, type InjectionKey } from 'vue'

export function isNetworkError(message: string) {
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|net::err_|网络请求失败/i.test(message)
}

export function createNotifications() {
  const items = ref<{ id: number; title: string; message: string; detail: string }[]>([])
  let sequence = 0
  function networkError(detail: string) {
    if (items.value.some(item => item.detail === detail)) return
    items.value = [...items.value, {
      id: ++sequence,
      title: '连接失败',
      message: '请求未能完成，请检查网络或本地服务后重试。',
      detail,
    }].slice(-3)
  }
  function dismiss(id: number) { items.value = items.value.filter(item => item.id !== id) }
  return { items, networkError, dismiss }
}

export type Notifications = ReturnType<typeof createNotifications>
export const notificationsKey: InjectionKey<Notifications> = Symbol('notifications')
