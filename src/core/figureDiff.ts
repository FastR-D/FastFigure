import type { FigureContainer,FigureDocument, FigureEdge } from './model.ts'

export type ChangeKind = 'document' | 'node' | 'container' | 'edge' | 'reference'
export type ChangeAction = 'added' | 'removed' | 'modified'
export interface FieldChange { name: string; before: string; after: string }
export interface FigureChange { kind: ChangeKind; id: string; label: string; action: ChangeAction; fields: FieldChange[] }
export interface FigureDiff { changes: FigureChange[]; added: number; removed: number; modified: number }
export const changeKindLabels: Record<ChangeKind, string> = { document: '工程', node: '节点', container: '容器', edge: '连接', reference: '参考图' }
export const changeActionLabels: Record<ChangeAction, string> = { added: '新增', removed: '删除', modified: '修改' }

function stable(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
  return JSON.stringify(value)
}
function display(value: unknown): string {
  if (value === undefined) return '未设置'
  if (value === null) return '无'
  const text = typeof value === 'string' ? value : stable(value)
  return text.length > 1200 ? `${text.slice(0, 1200)}…` : text
}
type Reader = { name: string; get: (object: Record<string, unknown>, figure: FigureDocument) => unknown }
const field = (name: string, key: string): Reader => ({ name, get: object => object[key] })
const geometry: Reader[] = [field('父容器', 'parentId'), { name: '位置', get: o => [o.x, o.y] }, { name: '尺寸', get: o => [o.width, o.height] }]
const endpoint = (edge: Record<string, unknown>, figure: FigureDocument, side: 'source' | 'target') => {
  const id = edge[side] as string
  return `${figure.nodes.find(n => n.id === id)?.label ?? id} (${id}) · ${edge[`${side}Port`]}`
}
const readers: Record<ChangeKind, Reader[]> = {
  document: [field('论文尺寸','publication'),field('AI 草稿完整来源','imageDrafts'),field('图件风格来源','styleUses'),field('图件绘图方案','compositionPlans'),field('图件参考用途','referenceUses'),field('工程名称', 'title'), field('画布', 'canvas'), field('主题', 'style')],
  node: [field('重建对象来源','reconstruction'),field('图表语义','chart'),field('绘制基准缩放','metricScale'),field('图元名称','name'),field('文字变换','textLayout'),field('标签', 'label'), field('注释','description'), {name:'图片素材',get:o=>{const n=o as unknown as import('./model').FigureNode;return n.image?{...n.image,dataUrl:undefined}:undefined}},field('混合文字','textRuns'),field('文字角色','textRole'),field('文字格式','textStyle'), field('注释格式','descriptionStyle'), field('内部结构','structure'),field('路径与绑定','path'),field('组件接口','interfaceFor'),field('命名接口','socket'), field('图示','iconId'), field('填充与描边','visual'), field('图元类型', 'kind'), ...geometry, field('证据来源', 'evidence')],
  container: [{name:'组合参数',get:object=>{const record=(object as FigureContainer).parametric;return record?{recipe:record.recipe.id,version:record.recipe.version,parameters:record.recipe.parameters,revision:record.revision,objects:Object.keys(record.objects).length}:undefined}},field('素材辅助重建来源','reconstructionReuse'),field('共享数值色标关联','sharedColorbar'),field('共享图例关联','sharedLegend'),field('实验图表数据','dataChart'),field('重建分区与坐标映射','reconstruction'),field('绘制基准缩放','metricScale'),field('组合透明度','opacity'),field('标题', 'title'), {name:'图片素材',get:o=>{const n=o as unknown as import('./model').FigureNode;return n.image?{...n.image,dataUrl:undefined}:undefined}},field('混合文字','textRuns'),field('文字角色','textRole'),field('文字格式','textStyle'), field('容器语义', 'role'), ...geometry, field('局部样式', 'appearance'),field('外框外观','visual'),field('结构来源','structureOrigin'), field('组件来源', 'component'), field('证据来源', 'evidence')],
  edge: [field('连线外观','appearance'),field('指定折点','manualRoute'),field('连线尺寸缩放','metricScale'),{name:'连线方式',get:o=>o.routing??'orthogonal'},{ name: '起点 / 端口', get: (o, f) => endpoint(o, f, 'source') }, { name: '终点 / 端口', get: (o, f) => endpoint(o, f, 'target') }],
  reference: [field('AI 草稿来源','generated'),field('名称', 'title'), field('引用', 'citation'), field('文件名', 'fileName'), field('原图指纹', 'sha256'), field('显示位置', 'placement'),
    { name: '图片内容', get: o => o.dataUrl }, { name: '像素尺寸', get: o => [o.pixelWidth, o.pixelHeight] }],
}
/** ID-based comparison. Collection / object key order never creates a change. No image bytes enter the report. */
export function diffFigures(before: FigureDocument, after: FigureDocument): FigureDiff {
  const changes: FigureChange[] = []
  function compare(kind: ChangeKind, oldObjects: Record<string, unknown>[], newObjects: Record<string, unknown>[]) {
    const old = new Map(oldObjects.map(o => [String(o.id), o])), next = new Map(newObjects.map(o => [String(o.id), o]))
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      const a = old.get(id), b = next.get(id), object = (b ?? a)!
      const label = kind === 'edge' ? `${endpoint(object, b ? after : before, 'source')} → ${endpoint(object, b ? after : before, 'target')}` : String(object.label ?? object.title ?? id)
      const fields: FieldChange[] = []
      for (const reader of readers[kind]) {
        const previous = a ? reader.get(a, before) : undefined, current = b ? reader.get(b, after) : undefined
        // A node rename must not count its incident edges as topology edits.
        if (kind === 'edge' && a && b&&['起点 / 端口','终点 / 端口'].includes(reader.name)) {
          const side: keyof FigureEdge = reader.name.startsWith('起点') ? 'source' : 'target'
          if (a[side] === b[side] && a[`${side}Port`] === b[`${side}Port`]) continue
        } else if (stable(previous) === stable(current)) continue
        fields.push({ name: reader.name,
          before: reader.name === '图片内容' && previous !== undefined ? '原图片' : display(previous),
          after: reader.name === '图片内容' && current !== undefined ? '新图片' : display(current) })
      }
      if (!a || !b || fields.length) changes.push({ kind, id, label, action: !a ? 'added' : !b ? 'removed' : 'modified', fields })
    }
  }
  compare('document', [{ id: 'document', publication:before.publication, title: before.title, canvas: before.canvas, style: before.style,referenceUses:before.referenceUses,compositionPlans:before.compositionPlans,styleUses:before.styleUses }], [{ id: 'document', publication:after.publication, title: after.title, canvas: after.canvas, style: after.style,referenceUses:after.referenceUses,compositionPlans:after.compositionPlans,styleUses:after.styleUses }])
  compare('node', before.nodes, after.nodes)
  compare('container', before.containers, after.containers)
  compare('edge', before.edges, after.edges)
  compare('reference', before.references, after.references)
  return { changes, added: changes.filter(c => c.action === 'added').length, removed: changes.filter(c => c.action === 'removed').length, modified: changes.filter(c => c.action === 'modified').length }
}
