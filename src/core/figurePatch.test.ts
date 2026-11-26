import { describe, it, expect } from 'vitest';
import { clone, createBlank, createExample } from './model.ts';
import { applyFigurePatch, figurePatchKey } from './figurePatch.ts';
import { FigurePatchStream } from './figurePatchStream.ts';
import { parseHarnessResponse } from './harness.ts';
import { figureThemes } from './figureThemes.ts';
import { createFigurePreviewDelta, applyFigurePreviewDelta } from './figurePreview.ts';

describe('incremental drawing compilation and streaming transactions',()=>{
  it('expands semantic objects, theme and auto layout into editable native geometry',()=>{
    const theme=figureThemes.find(theme=>theme.id==='theme-comic')!
    const original=createBlank(),before=clone(original),operations=[
      {op:'reset',title:'Declared encoder'}, {op:'theme',themeId:theme.id},
      {op:'add-node',node:{id:'samples',kind:'tokens',label:'Input tokens'}},
      {op:'add-node',node:{id:'encoder',label:'Encoder',structure:{type:'encoder',repeats:6},visual:{colorIndex:4}}},
      {op:'add-node',node:{id:'features',kind:'tensor',label:'Features'}},
      {op:'add-node',node:{id:'formula',kind:'text',label:'x2',textRole:'math',textRuns:[{text:'x'},{text:'2',script:'super'}]}},
      {op:'connect',edge:{id:'in',source:'samples',target:'encoder'}}, {op:'connect',edge:{id:'out',source:'encoder',target:'features'}},
      {op:'layout'},
    ],patch={base:figurePatchKey(original),operations},candidate=parseHarnessResponse(JSON.stringify({message:'Compiled',patch}),original).figure!
    expect(original).toEqual(before);expect(candidate.nodes.map(n=>n.id)).toEqual(['samples','encoder','features','formula'])
    expect(candidate.style).toMatchObject({paletteId:theme.paletteId,fontFamily:theme.fontFamily})
    expect(candidate.nodes[0]!.x+candidate.nodes[0]!.width).toBeLessThan(candidate.nodes[1]!.x)
    expect(candidate.nodes[1]!.structure).toEqual({type:'encoder',repeats:6});expect(candidate.edges.every(e=>e.sourcePort==='right'&&e.targetPort==='left')).toBe(true)
    expect(candidate.nodes.find(n=>n.id==='formula')).toMatchObject({textRole:'math',textRuns:[{text:'x'},{text:'2',script:'super'}]})
  })
  it('patches only declared fields, moves group children and rejects stale, injected or invalid batches atomically',()=>{
    const original=createExample(),before=clone(original),base=figurePatchKey(original)
    const changed=applyFigurePatch(original,{base,operations:[{op:'update-node',id:'encoder',changes:{label:'Author encoder',textStyle:{italic:true}}}]})
    expect(changed.nodes.find(n=>n.id==='encoder')).toEqual({...original.nodes.find(n=>n.id==='encoder'),label:'Author encoder',textStyle:{...original.nodes.find(n=>n.id==='encoder')!.textStyle,italic:true}})
    expect(changed.edges).toEqual(original.edges);expect(changed.containers).toEqual(original.containers)
    for(const operations of [[{op:'update-node',id:'encoder',changes:{label:'Transient'}},{op:'connect',edge:{id:'bad',source:'missing',target:'encoder'}}],[{op:'update-node',id:'encoder',changes:{chart:{role:'series'}}}],[{op:'remove',ids:['stage']}],[{op:'add-node',node:{id:'image',kind:'image',image:{dataUrl:'forged'}}}]])expect(()=>applyFigurePatch(original,{base,operations})).toThrow()
    expect(()=>applyFigurePatch(changed,{base,operations:[]})).toThrow('基准')
    const grouped=applyFigurePatch(createBlank(),{base:figurePatchKey(createBlank()),operations:[{op:'add-container',container:{id:'panel',title:'Known mechanism'}},{op:'add-node',node:{id:'item',parentId:'panel',label:'Known step'}}]})
    const group=grouped.containers.find(c=>c.id==='panel')!,moved=applyFigurePatch(grouped,{base:figurePatchKey(grouped),operations:[{op:'update-container',id:'panel',changes:{x:group.x+20,y:group.y+20}}]})
    expect(moved.nodes[0]!.x).toBe(grouped.nodes[0]!.x+20);expect(moved.nodes[0]!.y).toBe(grouped.nodes[0]!.y+20);expect(original).toEqual(before)
    expect(parseHarnessResponse(JSON.stringify({message:'Nothing changed',patch:{base,operations:[]}}),original).figure).toBeNull()
  })
  it('handles arbitrary chunk boundaries and validates each complete batch before exposing a preview',()=>{
    const original=createExample(),base=figurePatchKey(original),start=JSON.stringify({type:'start',protocol:'fastfigure.patch.v1',base}),batch=JSON.stringify({type:'patch',seq:1,operations:[{op:'update-node',id:'encoder',changes:{label:'编码器 🧪'}}]}),finish=JSON.stringify({type:'complete',seq:2,message:'Complete'})
    const stream=new FigurePatchStream(original)
    for(const char of start+'\n'+batch)expect(stream.push(char)).toBe(false)
    expect(stream.preview).toEqual(original);expect(stream.push('\n')).toBe(true);expect(stream.preview.nodes.find(n=>n.id==='encoder')!.label).toBe('编码器 🧪')
    expect(()=>stream.finish()).toThrow('complete');stream.push(finish);expect(stream.finish()!.patch.operations).toHaveLength(1)
    const result=parseHarnessResponse(start+'\n'+batch+'\n'+finish,original)
    expect(result.figure).toEqual(stream.preview)
    expect(()=>stream.push('\n'+batch+'\n')).toThrow('完成')
    const missing=new FigurePatchStream(original);missing.push(start+'\n');expect(()=>missing.push(batch.replace('"seq":1','"seq":2')+'\n')).toThrow('序号')
    const invalid=new FigurePatchStream(original);invalid.push(start+'\n'+batch+'\n');const good=clone(invalid.preview)
    expect(()=>invalid.push(JSON.stringify({type:'patch',seq:2,operations:[{op:'update-node',id:'encoder',changes:{label:'Partial'}},{op:'remove',ids:['missing']}]})+'\n')).toThrow()
    expect(invalid.preview).toEqual(good)
  })

  it('transports only changed objects and verifies ordering and revision before accepting a preview delta',()=>{
    const before=createExample(),after=clone(before);after.nodes[0]!.label='Updated tokens';after.nodes.reverse()
    const delta=createFigurePreviewDelta(before,after)
    expect(delta.nodes).toHaveLength(1);expect(delta.containers).toEqual([]);expect(delta.edges).toEqual([])
    expect(applyFigurePreviewDelta(before,delta)).toEqual(after)
    expect(()=>applyFigurePreviewDelta(after,delta)).toThrow('基准')
    expect(()=>applyFigurePreviewDelta(before,{...delta,result:'a'.repeat(16)})).toThrow('结果')
    expect(()=>applyFigurePreviewDelta(before,{...delta,order:{...delta.order,nodes:[]}})).toThrow('目录')
    expect(before.nodes[0]!.label).not.toBe('Updated tokens')
  })
  it('preserves opaque image bytes locally when a moved image crosses the preview transport',()=>{
    const before=createBlank();before.nodes=[{id:'illustration',kind:'image',label:'',parentId:'stage',x:100,y:200,width:80,height:60,image:{dataUrl:'data:image/png;base64,iVBORw0KGgo=',sha256:'a'.repeat(64),pixelWidth:80,pixelHeight:60,fit:'contain',alt:'Authored illustration'}}]
    const after=clone(before);after.nodes[0]!.x+=40
    const delta=createFigurePreviewDelta(before,after);expect(JSON.stringify(delta)).not.toContain('data:image');expect(applyFigurePreviewDelta(before,delta)).toEqual(after)
    const replacement=applyFigurePatch(before,{base:figurePatchKey(before),operations:[{op:'reset',title:'Redrawn figure'},{op:'add-node',node:{id:'illustration',label:'Replacement'}}]})
    const replacementDelta=createFigurePreviewDelta(before,replacement)
    expect(replacementDelta.clearedImages).toEqual(['illustration'])
    expect(applyFigurePreviewDelta(before,replacementDelta)).toEqual(replacement)
  })
})
