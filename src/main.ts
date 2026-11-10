import { createApp } from 'vue'
import App from './App.vue'
import '@fastrd/ui-vue/styles.css'
import './styles/app.css'
import { initColorMode } from '@fastrd/ui-foundation'
import './styles/fonts.css'
import './styles/workspace.css'

const colorMode = initColorMode({ storageKey: 'fastfigure.color-mode' })
if (import.meta.hot) import.meta.hot.dispose(() => colorMode.dispose())
createApp(App).mount('#app')
