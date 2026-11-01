import { describe, expect, it } from 'vitest'
import { clone, createExample, type ReferenceImage } from './model'
import { diffFigures } from './figureDiff'

describe('Figure change review', () => {
  it('ignores object / collection order and does not report renamed endpoints as rewired edges', () => {
    const before = createExample(), after = clone(before)
    after.nodes.reverse(); after.edges.reverse()
    after.style = { paletteId:before.style.paletteId, seed: before.style.seed, accent: before.style.accent, preset: before.style.preset, roughness: before.style.roughness }
    expect(diffFigures(before, after).changes).toEqual([])
    after.nodes.find(n => n.id === 'encoder')!.label = 'Revised encoder'
    const diff = diffFigures(before, after)
    expect(diff.modified).toBe(1)
    expect(diff.changes[0]).toMatchObject({ kind: 'node', id: 'encoder', fields: [{ name: '标签', before: 'Encoder', after: 'Revised encoder' }] })
  })
  it('reports additions, deletions, geometry, ports, representation, hierarchy, global styles and provenance', () => {
    const before = createExample(), after = clone(before)
    after.title = 'Rebuilt method'; after.style.preset = 'sketch'
    after.nodes = after.nodes.filter(n => n.id !== 'retriever')
    after.nodes.push({ ...before.nodes[2]!, id: 'new-retriever', label: 'New retriever' })
    const input = after.nodes[0]!
    Object.assign(input, { x: 110, width: 130, kind: 'module', evidence: { title: 'Paper', reference: 'Fig. 2' } })
    after.edges[1]!.target = 'new-retriever'; after.edges[1]!.sourcePort = 'top'
    after.containers[0]!.title = 'New stage'
    const snapshot = clone(after), diff = diffFigures(before, after)
    expect(diff.added).toBe(1); expect(diff.removed).toBe(1); expect(diff.modified).toBe(4)
    expect(diff.changes.find(c => c.id === 'input')?.fields.map(f => f.name)).toEqual(['图元类型', '位置', '尺寸', '证据来源'])
    expect(diff.changes.find(c => c.id === 'e2')?.fields).toHaveLength(2)
    expect(diff.changes.find(c => c.id === 'e2')?.fields[1]?.after).toContain('new-retriever')
    expect(diff.changes.find(c => c.id === 'document')?.fields.map(f => f.name)).toEqual(['工程名称', '主题'])
    expect(after).toEqual(snapshot)
  })
  it('exposes reference metadata and image replacement without serializing image bytes', () => {
    const before = createExample(), reference: ReferenceImage = { id: 'ref-1', title: 'Sketch', citation: 'Fig. A', fileName: 'sketch.png', sha256: 'a'.repeat(64), pixelWidth: 100, pixelHeight: 100,
      dataUrl: 'data:image/png;base64,SEVMTE8=', placement: { x: 0, y: 0, width: 100, height: 100 } }
    before.references = [reference]
    const after = clone(before); after.references[0]!.citation = 'Fig. B'; after.references[0]!.dataUrl = 'data:image/png;base64,V09STEQ='
    const diff = diffFigures(before, after), encoded = JSON.stringify(diff)
    expect(diff.changes[0]?.fields.map(f => f.name)).toEqual(['引用', '图片内容'])
    expect(encoded).not.toContain('SEVMTE8='); expect(encoded).not.toContain('V09STEQ='); expect(encoded).not.toContain('data:image')
    expect(diffFigures(createExample(), after).changes[0]).toMatchObject({ kind: 'reference', action: 'added' })
  })
  it('detects changed source records even with the same number of sources and respects ID type changes', () => {
    const before = createExample(), after = clone(before)
    before.containers[0]!.component = { assetId: 'a', name: 'Reusable', revision: new Date().toISOString(), sources: [{ title: 'Paper', reference: 'Fig. A' }], lineage: [] }
    after.containers[0]!.component = clone(before.containers[0]!.component)
    after.containers[0]!.component.sources[0]!.reference = 'Fig. B'
    expect(diffFigures(before, after).changes[0]?.fields[0]?.name).toBe('组件来源')
    after.nodes = after.nodes.filter(n => n.id !== 'input')
    after.containers.push({ id: 'input', title: 'Input group', role: 'group', parentId: 'stage', x: 100, y: 170, width: 220, height: 150 })
    const changes = diffFigures(before, after).changes.filter(c => c.id === 'input')
    expect(changes.map(c => [c.kind, c.action])).toEqual([['node', 'removed'], ['container', 'added']])
  })
})
