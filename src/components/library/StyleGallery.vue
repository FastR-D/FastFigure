<script setup lang="ts">
import { Box, Button, Text } from '@fastrd/ui-vue'
import { Icon } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { styles } from '../../core/model'
import StylePreview from './StylePreview'
import ContainerStyleControls from './ContainerStyleControls.vue'
import {figureThemes,paperThemes} from '../../core/figureThemes'
const editor = useEditor()
</script>

<template>
  <Box class="style-theme-gallery">
    <Text class="style-section-label">论文主题</Text>
    <Box class="paper-theme-gallery" aria-label="论文主题">
      <Button v-for="theme in paperThemes" :key="theme.id" class="style-card theme-card paper-theme-card" variant="quiet" :aria-pressed="editor.activeStyle.value.designSystem==='paper'&&editor.activeStyle.value.preset!=='sketch'&&(editor.activeStyle.value.paperTheme?.variant??'soft')===theme.paperTheme?.variant" :aria-label="`应用 ${theme.name} 主题`" @click="editor.applySavedStyle(theme,true)">
        <StylePreview :theme="theme" /><Box class="style-card-caption"><Text>{{ theme.name }}</Text><Icon v-if="editor.activeStyle.value.designSystem==='paper'&&editor.activeStyle.value.preset!=='sketch'&&(editor.activeStyle.value.paperTheme?.variant??'soft')===theme.paperTheme?.variant" name="check" /></Box><Text class="theme-card-detail">{{ theme.description }}</Text><Text class="theme-card-detail">标题 {{ theme.paperTheme?.headingSize }} · 正文 {{ theme.paperTheme?.bodySize }} · 注释 {{ theme.paperTheme?.captionSize }}</Text>
      </Button>
    </Box>
    <Text class="style-section-label">手绘主题</Text>
    <Text class="muted-caption">一并设置初始字体、配色和笔触，之后可在画板工具栏自由改字体。</Text>
    <Box class="style-gallery" aria-label="手绘主题">
      <Button v-for="theme in figureThemes" :key="theme.id" class="style-card theme-card" variant="quiet" :aria-pressed="editor.activeStyle.value.preset==='sketch'&&editor.activeStyle.value.sketchStyle===theme.sketchStyle" :aria-label="`应用 ${theme.name} 主题`" @click="editor.applyTheme(theme.sketchStyle!)">
        <StylePreview :theme="theme" />
        <Box class="style-card-caption"><Text>{{ theme.name }}</Text><Icon v-if="editor.activeStyle.value.preset==='sketch'&&editor.activeStyle.value.sketchStyle===theme.sketchStyle" name="check" /></Box>
        <Text class="theme-card-detail">{{ theme.fontFamily }} · {{ theme.description }}</Text>
      </Button>
    </Box>
    <Text class="muted-caption">Comic Sans MS 优先使用系统字体，缺失时使用已内置的 Comic Neue。图表与定位字形保留原格式。</Text>
    <Text class="style-section-label">容器样式</Text>
    <Box class="style-gallery">
    <Button v-for="style in styles" :key="style.id" class="style-card" variant="quiet" :aria-pressed="editor.activeStyle.value.preset === style.id&&!editor.activeStyle.value.sketchStyle" :aria-label="`应用${style.name}样式`" @click="editor.setStyle(style.id)">
      <StylePreview :preset="style.id" />
      <Box class="style-card-caption"><Text>{{ style.name }}</Text><Icon v-if="editor.activeStyle.value.preset === style.id&&!editor.activeStyle.value.sketchStyle" name="check" /></Box>
    </Button>
    </Box>
    <ContainerStyleControls />
  </Box>
</template>
