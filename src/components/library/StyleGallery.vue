<script setup lang="ts">
import { Box, Button, Text, Icon } from '../ui'
import { useEditor } from '../../composables/useEditor'
import { styles } from '../../core/model'
import StylePreview from './StylePreview'
import {figureThemes,paperTheme} from '../../core/figureThemes'
const editor = useEditor()
</script>

<template>
  <Box class="style-theme-gallery">
    <Text class="style-section-label">默认论文风格</Text><Button class="style-card theme-card" variant="quiet" :aria-pressed="editor.activeStyle.value.designSystem==='paper'" aria-label="应用论文插图主题" @click="editor.applySavedStyle(paperTheme,true)"><StylePreview :theme="paperTheme" /><Text>论文插图</Text><Text class="theme-card-detail">规整轮廓 · 手写正文 · 柔和语义色</Text></Button>
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
  </Box>
</template>
