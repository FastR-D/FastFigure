import { z } from 'zod'
import { importSvg, type SvgImportOptions } from './svgImport.ts'
import { parseAsset } from './assets.ts'
export const figureforgeCommit='af778027c866e2e6b3432b946e44a4a2b4434d82'
export const figureforgeUrl='https://jing1312.github.io/nature-figure-skill/figureforge/'
export const figureforgeResources=z.object({version:z.literal(1),commit:z.literal(figureforgeCommit),templates:z.array(z.object({id:z.string().regex(/^[a-z-]+$/),name:z.string().max(100),svg:z.string().max(200_000),sha256:z.string().regex(/^[a-f\d]{64}$/),unavailable:z.string().optional()})).max(30)})
export type FigureforgeTemplate=z.infer<typeof figureforgeResources>['templates'][number]
export function convertFigureforgeTemplate(template:FigureforgeTemplate,options:Pick<SvgImportOptions,'parseXml'|'measure'>={}) {
  if(template.unavailable)throw new Error(template.unavailable)
  const {asset}=importSvg(template.svg,{...options,fileName:`figureforge-${template.id}.svg`,sha256:template.sha256,keepGroups:false})
  asset.id=`figureforge-${template.id}`;asset.name=`${template.name} · 示例`;asset.figure.title=asset.name;asset.figure.containers[0]!.title=asset.name
  asset.description='FigureForge 的可编辑示例模板。图中数值、误差线与显著性仅为示例，请依据真实实验数据更新。支持系列关联换色。'
  asset.tags=['图表','FigureForge','示例',template.id]
  const reference=`${figureforgeUrl} · jing1312 / Yuan Yizhe · MIT · ${figureforgeCommit} · ${template.id}`
  for(const source of asset.sources)source.reference=`${reference} · SHA-256 ${template.sha256}`
  for(const object of [...asset.figure.nodes,...asset.figure.containers])if(object.evidence)object.evidence.reference=`${reference} · SHA-256 ${template.sha256}`
  return parseAsset(asset)
}
