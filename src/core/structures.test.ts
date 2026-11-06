import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { createEditor } from '../composables/useEditor'
import { defaultPaletteId } from '../data/materials'
import { catalogueAsset } from './catalogue'
import { captureComponent, componentDocument, importComponentText, instantiateComponent } from './assets'
import { clone, createBlank, parseDocument } from './model'
import { nodeStructure, structureLabels, structurePresets } from './structures'
import { structuredNodeLayout, structureParts } from './structureVisual'
import { figurePaint } from './paint'
import { exportSvg } from './svg'
import { parseHarnessResponse } from './harness'
import { diffFigures } from './figureDiff'

let scope:ReturnType<typeof effectScope>
beforeEach(()=>{ scope=effectScope();const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)}) })
afterEach(()=>{scope.stop();vi.unstubAllGlobals()})
const editor=()=>scope.run(createEditor)!
const seed=(id:string)=>catalogueAsset({kind:'seed',id})
describe('paper component structural grammar',()=>{
  it('gives each advertised architecture distinct native geometry at full and compact sizes',()=>{
    for(const preset of structurePresets.filter(p=>p.type!=='none')) {
      const doc=createBlank(),node={id:preset.type,parentId:'stage',kind:'module' as const,label:preset.name,x:100,y:180,width:184,height:preset.height,structure:{type:preset.type}}
      const layout=structuredNodeLayout(node),parts=structureParts(node,layout.area,figurePaint(doc.style))
      expect(parts.length,preset.type).toBeGreaterThan(6)
      expect(parts.some(p=>p.label)).toBe(true)
      expect(new Set(parts.map(p=>p.key)).size).toBe(parts.length)
      for(const p of parts) {
        expect(p.x).toBeGreaterThanOrEqual(layout.area.x-.01);expect(p.y).toBeGreaterThanOrEqual(layout.area.y-.01)
        expect(p.x+p.width).toBeLessThanOrEqual(layout.area.x+layout.area.width+.01)
        expect(p.y+p.height).toBeLessThanOrEqual(layout.area.y+layout.area.height+.01)
        expect([p.x,p.y,p.width,p.height].every(Number.isFinite)).toBe(true)
      }
      const compact=structureParts({...node,width:100,height:66},{x:10,y:28,width:80,height:30},figurePaint(doc.style))
      expect(compact.length).toBeGreaterThan(6);expect(compact.every(p=>!p.label)).toBe(true)
    }
    const encoder=seed('encoder').figure.nodes[0]!,decoder=seed('decoder').figure.nodes[0]!
    const parts=(n:typeof encoder)=>structureParts(n,structuredNodeLayout(n).area,figurePaint(createBlank().style))
    expect(parts(encoder).filter(p=>p.key.startsWith('residual-'))).toHaveLength(2)
    expect(parts(decoder).filter(p=>p.key.startsWith('residual-'))).toHaveLength(3)
    expect(parts(decoder).find(p=>p.key==='encoder-context')?.arrow).toBe(true)
    expect(structureLabels(nodeStructure(decoder)!)).toContain('Cross-attention')
  })
  it('keeps structure explicit when labels change, permits a generic box, and rejects invented parameters',()=>{
    const doc=seed('encoder').figure,node=doc.nodes[0]!
    node.label='视觉分支';expect(nodeStructure(node)?.type).toBe('encoder')
    node.structure={type:'none'};expect(nodeStructure(node)).toBeUndefined()
    for(const structure of [{type:'unknown'},{type:'encoder',repeats:13},{type:'encoder',labels:['a'.repeat(41)]}]) expect(()=>parseDocument({...doc,nodes:[{...node,structure}]})).toThrow()
    expect(nodeStructure({...node,structure:undefined,label:'Arbitrary module'})).toBeUndefined()
  })
  it('retains real vector structures, editable labels and fonts in SVG',()=>{
    const doc=seed('decoder').figure,node=doc.nodes[0]!
    node.textStyle={family:'MiSans',size:18,bold:true,italic:true};node.description='Context-aware';node.structure!.labels=['因果注意力','残差归一化','编码器上下文','Add & Norm','FFN','Add & Norm']
    const svg=exportSvg(doc)
    expect(svg).toContain('data-structure="decoder"');expect(svg).toContain('data-edit-field="structure:0"')
    expect(svg).toContain('font-weight="700"');expect(svg).toContain('font-style="italic"');expect(svg).toContain('MiSans')
    expect(svg).not.toContain('<image');
  })
  it('preserves structural parameters, annotation, icon and palette through capture / JSON / insertion',()=>{
    const doc=seed('encoder').figure,node=doc.nodes[0]!
    node.description='Features';node.iconId='mdi:chip';node.textStyle={family:'MiSans',size:19,italic:true};node.descriptionStyle={color:'#334455'}
    node.structure={type:'encoder',repeats:4,labels:['自注意力','Norm','MLP','Norm']};doc.style.paletteId=defaultPaletteId
    const asset=importComponentText(JSON.stringify(captureComponent(doc,'stage','实验编码器')))
    const inserted=instantiateComponent(createBlank(),asset,'stage').document
    expect(inserted.nodes[0]).toMatchObject({structure:node.structure,textStyle:node.textStyle,description:node.description,iconId:node.iconId,descriptionStyle:node.descriptionStyle})
    expect(inserted.containers.find(c=>c.id!=='stage')?.appearance?.paletteId).toBe(defaultPaletteId)
    expect(componentDocument(asset).style.paletteId).toBe(defaultPaletteId)
  })
  it('shares the canonical grammar with Harness, preserves omitted formatting, and reports structural changes',()=>{
    const doc=seed('encoder').figure,node=doc.nodes[0]!
    node.textStyle={family:'MiSans',size:20,bold:true};node.description='Features';node.iconId='mdi:chip'
    const proposal=clone(doc);delete proposal.nodes[0]!.structure;delete proposal.nodes[0]!.textStyle;delete proposal.nodes[0]!.description;delete proposal.nodes[0]!.iconId
    const parsed=parseHarnessResponse(JSON.stringify({message:'Updated',figure:proposal}),doc).figure!
    expect(parsed.nodes[0]).toMatchObject(node)
    parsed.nodes[0]!.structure!.repeats=2
    expect(diffFigures(doc,parsed).changes[0]?.fields.some(f=>f.name==='内部结构')).toBe(true)
    const invalid=clone(doc);invalid.nodes[0]!.iconId='mdi:invented'
    expect(()=>parseHarnessResponse(JSON.stringify({message:'Bad',figure:invalid}),doc)).toThrow('契约')
  })
})
describe('canvas typography, material selection and inline edits',()=>{
  it('retains a recognized structure when renaming an existing conventional module',()=>{
    const e=editor();e.update(doc=>{delete doc.nodes.find(n=>n.id==='encoder')!.structure})
    e.select('encoder');e.setLabel('视觉编码器')
    expect(e.selectedNode.value?.structure?.type).toBe('encoder')
    expect(nodeStructure(e.selectedNode.value!)?.type).toBe('encoder')
    e.setNodeStructure('none');expect(nodeStructure(e.selectedNode.value!)).toBeUndefined()
    e.undo();e.select('encoder');expect(nodeStructure(e.selectedNode.value!)?.type).toBe('encoder')
  })
  it('expands a selected structural module only when geometry fits, and keeps failures atomic',()=>{
    const e=editor();e.select('encoder');const original=clone(e.figure.value)
    expect(e.fitStructure()).toBe(true);expect(e.selectedNode.value).toMatchObject({width:184,height:164})
    e.undo();expect(e.figure.value).toEqual(original);e.select('encoder')
    e.update(doc=>{doc.nodes.push({id:'obstacle',parentId:'stage',kind:'rectangle',label:'',x:440,y:320,width:24,height:24})})
    const crowded=clone(e.figure.value),count=e.past.value.length
    expect(e.fitStructure()).toBe(false);expect(e.notice.value).toContain('空间不足');expect(e.figure.value).toEqual(crowded);expect(e.past.value).toHaveLength(count)
  })
  it('commits inline label and internal labels once, cancels cleanly, and restores them with undo',()=>{
    const e=editor(),before=clone(e.figure.value)
    e.beginTextEdit('encoder');e.finishTextEdit('视觉编码器',true);expect(e.figure.value).toEqual(before);expect(e.past.value).toHaveLength(0)
    e.beginTextEdit('encoder');e.finishTextEdit('视觉编码器');expect(e.selectedNode.value?.label).toBe('视觉编码器');expect(e.past.value).toHaveLength(1)
    e.beginTextEdit('encoder','structure:0');e.finishTextEdit('局部注意力');expect(e.selectedNode.value?.structure?.labels?.[0]).toBe('局部注意力')
    e.undo();expect(e.selectedNode.value?.structure?.labels).toBeUndefined();e.undo();expect(e.figure.value).toEqual(before)
    e.beginTextEdit('encoder');e.finishTextEdit('');expect(e.figure.value).toEqual(before)
  })
  it('applies formatting to a group atomically, keeps annotation format independent and round-trips saved state',()=>{
    const e=editor();e.selectedId.value='stage'
    expect(e.formatText({family:'MiSans',size:18,bold:true,italic:true})).toBe(true)
    expect(e.figure.value.nodes.every(n=>n.textStyle?.size===18&&n.textStyle.italic)).toBe(true)
    const before=clone(e.figure.value);expect(e.formatText({size:0})).toBe(false);expect(e.figure.value).toEqual(before)
    e.select('encoder');e.textTarget.value='description';e.formatText({size:12,color:'#345678'})
    expect(e.selectedNode.value?.textStyle?.size).toBe(18);expect(e.selectedNode.value?.descriptionStyle?.size).toBe(12)
    e.save();expect(editor().figure.value).toEqual(e.figure.value)
  })
  it('edits blank shapes and validates shared palette / icon IDs',()=>{
    const e=editor();e.newProject('blank')
    e.addNode('rectangle','');expect(e.selectedNode.value?.label).toBe('');e.setSize('width',24);e.setSize('height',20)
    expect(e.selectedNode.value).toMatchObject({width:24,height:20})
    e.addIcon('mdi:chip');expect(e.selectedNode.value?.iconId).toBe('mdi:chip')
    e.applyPalette(defaultPaletteId);expect(e.figure.value.style.paletteId).toBe(defaultPaletteId)
    const before=clone(e.figure.value);e.addIcon('bad');e.applyPalette('bad');expect(e.figure.value).toEqual(before)
    expect(()=>parseDocument({...e.figure.value,style:{...e.figure.value.style,paletteId:'unknown'}})).toThrow()
  })
})
