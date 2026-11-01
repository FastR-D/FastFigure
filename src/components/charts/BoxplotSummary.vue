<script setup lang="ts">
import { Box,Disclosure,DisclosureTrigger,Table,TableBody,TableCell,TableHead,TableHeader,TableRow,Text } from '../ui'
import type { BoxplotReport } from '../../core/boxplotContract'
defineProps<{report:BoxplotReport}>()
</script>
<template>
  <Box class="boxplot-summary" aria-label="箱线图统计摘要">
    <Text>原始观测（使用者声明）· 四分位数：type 7 线性插值 · 须线：1.5×IQR</Text>
    <Text>原始点叠加：{{ report.rawPointsShown?'全部有效样本':'仅离群点' }}；离群点始终显示，缺失不补零。</Text>
    <Text v-for="group in report.groups" :key="group.name">{{ group.name }}：n={{ group.n }} · 缺失 {{ group.missing }} · 离群 {{ group.outliers }}</Text>
    <Disclosure><DisclosureTrigger size="xs">查看统计摘要</DisclosureTrigger><Box class="chart-data-table-scroll"><Table aria-label="箱线图分组统计表"><TableHead><TableRow><TableHeader>组</TableHeader><TableHeader>n</TableHeader><TableHeader>缺失</TableHeader><TableHeader>Q1</TableHeader><TableHeader>中位数</TableHeader><TableHeader>Q3</TableHeader><TableHeader>下须</TableHeader><TableHeader>上须</TableHeader><TableHeader>离群</TableHeader></TableRow></TableHead><TableBody><TableRow v-for="group in report.groups" :key="group.name"><TableCell>{{ group.name }}</TableCell><TableCell>{{ group.n }}</TableCell><TableCell>{{ group.missing }}</TableCell><TableCell>{{ group.q1 }}</TableCell><TableCell>{{ group.median }}</TableCell><TableCell>{{ group.q3 }}</TableCell><TableCell>{{ group.whiskerLow }}</TableCell><TableCell>{{ group.whiskerHigh }}</TableCell><TableCell>{{ group.outliers }}</TableCell></TableRow></TableBody></Table></Box></Disclosure>
  </Box>
</template>
