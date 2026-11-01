import {paperStructureSources} from './paperStructures.ts'
import type {ComponentSource} from '../core/model.ts'
import type {structuralRecipeIds} from './structuralFigures.ts'

// Verified local source inventories: docs/research/ppt-structure-evidence{,-v2}.json.
export const structuralSources:Record<typeof structuralRecipeIds[number],ComponentSource[]>={
  ...paperStructureSources,
  "layered-architecture": [
    {
      "title": "项目管理全视图框架（5 大体系 + 中心管理与控制 + 流程 + 平台）",
      "reference": "FastPPT references/GordenPPTSkill/templates/architecture-deck/template.pptx · 第 1 页 · 11ebacee969e-0001 · PPTX SHA-256 03cdc0b85e2e26ea9a2f02e467c5fb79614299250514fb3399f6170485c9e06f。仅参考结构关系，使用中性内容独立重绘，不复制原版式、品牌或示例数据。"
    },
    {
      "title": "基于内生 AI 的移动算网架构（多层网络架构）",
      "reference": "FastPPT references/GordenPPTSkill/templates/architecture-deck/template.pptx · 第 13 页 · 11ebacee969e-0013 · PPTX SHA-256 03cdc0b85e2e26ea9a2f02e467c5fb79614299250514fb3399f6170485c9e06f。仅参考结构关系，使用中性内容独立重绘，不复制原版式、品牌或示例数据。"
    }
  ],
  "hierarchy-tree": [
    {
      "title": "部门KPI拆解/团队组织架构",
      "reference": "FastPPT references/pptset/【绿色版】200页逻辑框架汇报PPT模板.pptx · 第 22 页 · a05afce176e0-0022 · PPTX SHA-256 0adeb3d7a1827620849095b43b18179f6caf10a660a7ae80152b36d4f5a0435e。仅参考结构关系，使用中性内容独立重绘，不复制原版式、品牌或示例数据。"
    }
  ],
  "radial-hub": [
    {
      "title": "顶部研究标题 + 中央放射图：1 个中心奖杯图标 + 周围 6 个圆形子项（每项 = 图标 + 标题 + 多行说明）。",
      "reference": "FastPPT references/GordenPPTSkill/templates/thesis-novice/template.pptx · 第 1 页 · 4013c739f962-0001 · PPTX SHA-256 fadca83953a2bc87de78dcdc1fe76515f334cd9014905b267d07edb36c4b27dd。仅参考结构关系，使用中性内容独立重绘，不复制原版式、品牌或示例数据。"
    }
  ],
  "cycle-loop": [
    {
      "title": "多段内容页-互联网产品运营循环图",
      "reference": "FastPPT references/GordenPPTSkill/templates/mckinsey-style/template.pptx · 第 8 页 · 5e206af1d674-0008 · PPTX SHA-256 4318e0275748feb5bdea2bf81819312f99f97474fc37a88b25f62ca01b143b8c。仅参考结构关系，使用中性内容独立重绘，不复制原版式、品牌或示例数据。"
    }
  ],
  "structure-matrix": [
    {
      "title": "项目管理全视图框架（5 大体系 + 中心管理与控制 + 流程 + 平台）",
      "reference": "FastPPT references/GordenPPTSkill/templates/architecture-deck/template.pptx · 第 1 页 · 11ebacee969e-0001 · PPTX SHA-256 03cdc0b85e2e26ea9a2f02e467c5fb79614299250514fb3399f6170485c9e06f。仅参考结构关系，使用中性内容独立重绘，不复制原版式、品牌或示例数据。"
    },
    {
      "title": "年度目标   每个模块贯彻年度目标，实现增长",
      "reference": "FastPPT references/pptset/01-【红蓝】50页工作汇报专用PPT模板.pptx · 第 18 页 · e48d83706172-0018 · PPTX SHA-256 23979d658f5c428482bd867168f4213ff39833e68146af33c15018e03453a256。仅参考结构关系，使用中性内容独立重绘，不复制原版式、品牌或示例数据。"
    }
  ],
  "tiered-pyramid": [
    {
      "title": "五段内容页 - 金字塔图：5 层金字塔 (战略目标→年度→季度→月度→日常) + 5 阶段说明。",
      "reference": "FastPPT references/GordenPPTSkill/templates/premium-corp/template.pptx · 第 35 页 · 34422534f8b5-0035 · PPTX SHA-256 502c871be80b930400e9815ef0581232610261a8c0389d1642b409b872bd0c28。仅参考结构关系，使用中性内容独立重绘，不复制原版式、品牌或示例数据。"
    },
    {
      "title": "漏斗模型-项目进度与任务筛选",
      "reference": "FastPPT references/GordenPPTSkill/templates/mckinsey-style/template.pptx · 第 26 页 · 5e206af1d674-0026 · PPTX SHA-256 4318e0275748feb5bdea2bf81819312f99f97474fc37a88b25f62ca01b143b8c。仅参考结构关系，使用中性内容独立重绘，不复制原版式、品牌或示例数据。"
    }
  ],
  "coupled-cycles": [
    {
      "title": "多段内容页 - 互联网产品运营循环图：6+ 节点 + 大循环。",
      "reference": "FastPPT references/GordenPPTSkill/templates/premium-corp/template.pptx · 第 20 页 · 34422534f8b5-0020 · PPTX SHA-256 502c871be80b930400e9815ef0581232610261a8c0389d1642b409b872bd0c28。抽象页面中的分区、交叠或环形关系独立构造，不复刻原版式、品牌或示例数据。"
    },
    {
      "title": "同心圆 + 职业圈层",
      "reference": "FastPPT references/GordenPPTSkill/templates/red-teaching-models/template.pptx · 第 13 页 · 39f4aad07819-0013 · PPTX SHA-256 268d5c1cba9ff94b3ea6b03b8ad007110c4d839624bfc3f70b6cf42644f7edee。抽象页面中的分区、交叠或环形关系独立构造，不复刻原版式、品牌或示例数据。"
    }
  ],
  "swimlane-process": [
    {
      "title": "项目流程规划（6.1~8.15 时间段 + 任务节点）",
      "reference": "FastPPT references/GordenPPTSkill/templates/architecture-deck/template.pptx · 第 2 页 · 11ebacee969e-0002 · PPTX SHA-256 03cdc0b85e2e26ea9a2f02e467c5fb79614299250514fb3399f6170485c9e06f。抽象页面中的分区、交叠或环形关系独立构造，不复刻原版式、品牌或示例数据。"
    }
  ],
  "set-overlap": [
    {
      "title": "The company is free to plan and operate a platform In the example",
      "reference": "FastPPT references/pptset/【加赠】700页逻辑图形 (1).pptx · 第 275 页 · f753356251a9-0275 · PPTX SHA-256 05a29b9373ad4ecd773261e9a0493e2ba7231a79ecb68a6049a2dd0881d03343。抽象页面中的分区、交叠或环形关系独立构造，不复刻原版式、品牌或示例数据。"
    }
  ],
  "concentric-layers": [
    {
      "title": "杜绝任何工作上的随意性",
      "reference": "FastPPT references/pptset/【天空蓝配色版】定制级工作型PPT设计灵感手册.pptx · 第 16 页 · 5eb4d31d8b16-0016 · PPTX SHA-256 0295994f4578d83cca364c1526a7a6d3d617b90c4ae9640e8e51489790df3773。抽象页面中的分区、交叠或环形关系独立构造，不复刻原版式、品牌或示例数据。"
    },
    {
      "title": "骑行类业务流程",
      "reference": "FastPPT references/GordenPPTSkill/templates/architecture-deck/template.pptx · 第 4 页 · 11ebacee969e-0004 · PPTX SHA-256 03cdc0b85e2e26ea9a2f02e467c5fb79614299250514fb3399f6170485c9e06f。抽象页面中的分区、交叠或环形关系独立构造，不复刻原版式、品牌或示例数据。"
    }
  ]
}
