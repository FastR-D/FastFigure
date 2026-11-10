<script setup lang="ts">
import {Box,Button,Footer,Header,Heading,Modal,ModalBody,Text} from '@fastrd/ui-vue'
import IconButton from '../ui/IconButton.vue'
defineProps<{open:boolean}>();defineEmits<{close:[]}>()
const sections=[
  {title:'选择与编辑',items:[['组件拖拽','将左侧组件拖到画布指定位置；组合按默认参数插入，点击卡片可预览或配置。拖入容器可自动归入该容器，支持撤销。'],['选择','单击图块；Shift 单击可多选，空白处拖动可框选。'],['编辑文字','双击文字块进入编辑；点击“完成”或 Ctrl / ⌘ Enter 保存，Esc 或点击编辑框外取消并丢弃本次修改。'],['调整大小','拖动右下角默认等比例缩放；按住 Shift 可自由调整宽高。神经元、融合算子等圆形符号也可缩小。'],['文字完整显示','文字保持原字号并完整换行；用“检查文字”定位空间不足。']]},
  {title:'移动与对齐',items:[['微调','选中后按方向键移动 1 个单位，Shift + 方向键移动 10 个单位；工具栏也有四向按钮。'],['吸附','拖动时显示边缘和中心参考线，并自动吸附；按住 Alt 可暂时关闭吸附。'],['直角箭头','启用箭头工具后，点击创建点、拖拽调整点；双击、Enter 或“完成箭头”结束，Esc 取消。'],['连线与路径','连线跟随绑定的节点。Alt 单击可选取线条；选中折点后可拖动或用方向键调整。']]},
  {title:'画布视图',items:[['尺寸与缩放','顶栏宽、高输入框可直接修改画布尺寸，Enter 或移开焦点应用，Esc 放弃输入；滚轮或加减按钮调整视图比例。'],['平移','按住鼠标右键拖动可平移整张画布；“适应画布”恢复视图。'],['撤销与保存','Ctrl / ⌘ Z 撤销，Ctrl / ⌘ Shift Z 重做，Ctrl / ⌘ S 保存。']]},
  {title:'样式、数据与导出',items:[['主题','左侧“样式”设置主题、配色和边界；画板工具栏调整字体与字号。'],['图表与助手','从组件栏添加数据图表，或通过助手导入数据、生成方案，再预览并应用。'],['导出','顶栏导出 SVG、PNG 或工程 JSON；论文尺寸与裁切在画布工具栏设置。']]},
]
</script>
<template><Modal :open="open" label="使用指南" size="lg" @close="$emit('close')"><Header><Heading>使用指南</Heading><IconButton icon="close" label="关闭使用指南" @click="$emit('close')" /></Header><ModalBody><Box class="workspace-help-grid"><Box v-for="section in sections" :key="section.title" class="workspace-help-section"><Heading>{{ section.title }}</Heading><Box v-for="[label,description] in section.items" :key="label"><Text as="strong">{{ label }}</Text><Text>{{ description }}</Text></Box></Box></Box></ModalBody><Footer><Button variant="primary" @click="$emit('close')">开始绘图</Button></Footer></Modal></template>
