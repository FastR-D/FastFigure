import {editableFigure} from './editableFigure'
import {createDetailInset} from './detailInset'
import {applyMaterialEdits} from './materialEditing'
import {componentContentJson} from './componentContent'
import {componentSnapshotJson} from './componentRepository'
import {captureObjectSelection} from './componentCapture'
import {collectionSelectionJson} from './componentCaptureContract'
import {buildDataChart} from './dataChart'
import {chartExample} from './dataChartTable'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {DOMParser} from '@xmldom/xmldom'
import { effectScope } from 'vue'
import { buildRecipe,componentRecipes } from '../data/recipes'
import { captureComponent, componentDocument, importComponentText, instantiateComponent, parseAsset,scaleComponent } from './assets'
import { clone, createBlank, createExample, parseDocument, rootContainer } from './model'
import { contentBounds, contains, groupObjects, moveObjects, resolveStyle } from './geometry'
import { createComponentLibrary, LIBRARY_KEY } from '../composables/useComponentLibrary'
import { createEditor } from '../composables/useEditor'
import { exportSvg } from './svg'
import {nodeVisual} from './svg'
import {catalogueAsset,composeCatalogue,describeCatalogue,componentInstanceSchema} from './catalogue'
import {pathCoordinates,pathPoints,pathSegments} from './paths'
import {figurePaint,pathFill} from './paint'
import {colorSlotInventory,setContainerColorMap} from './colorMapping'
import {routeFigure,segmentHitsRect} from './routing'
import {checkFigureText} from './figureTextCheck'
import {updateRecipeInstance} from './recipeUpdate'
import {parseHarnessResponse} from './harness'
import {diffFigures} from './figureDiff'

let storage: Map<string, string>, scope: ReturnType<typeof effectScope>
beforeEach(() => {
  storage = new Map(); scope = effectScope()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
})
afterEach(() => { scope.stop(); vi.unstubAllGlobals() })
const pipeline = () => buildRecipe('pipeline', { stages: 2, direction: 'row' })

describe('parameterized editable components', () => {
  it('keeps mixed-modality attention causal between blocks and bidirectional only inside the same image block',()=>{
    for(const format of ['text-image','image-text','interleaved','text-only']){
      const doc=buildRecipe('mixed-modal-mask',{format,textTokens:3,imageTokens:3}).figure,cell=(q:string,k:string)=>doc.nodes.find(n=>n.id===`permission-${q}-${k}`)!,blocked=(q:string,k:string)=>cell(q,k).visual!.fill===doc.nodes.find(n=>n.id==='permission-key-2')!.visual!.fill
      expect(checkFigureText(doc).total).toBe(0);expect(doc.nodes.length).toBeLessThanOrEqual(240);expect(doc.nodes.some(n=>n.path)).toBe(false)
      expect(blocked('text1-0','text1-1')).toBe(true);expect(blocked('text1-1','text1-0')).toBe(false);expect(blocked('text1-0','text1-0')).toBe(false)
      if(format!=='text-only'){
        expect(blocked('image1-0','image1-2')).toBe(false);expect(cell('image1-0','image1-2').visual!.colorIndex).toBe(2)
        expect(blocked('text1-0','image1-0')).toBe(format!=='image-text');expect(blocked('image1-0','text1-0')).toBe(format==='image-text')
        const t=doc.nodes.find(n=>n.id==='sequence-text1-0')!,i=doc.nodes.find(n=>n.id==='sequence-image1-0')!;expect(t.x<i.x).toBe(format!=='image-text')
      }
      if(format==='interleaved'){
        expect(doc.nodes.filter(n=>n.id.startsWith('permission-')&&!n.id.startsWith('permission-key-'))).toHaveLength(144)
        expect(blocked('image1-0','image2-0')).toBe(true);expect(blocked('image2-0','image1-2')).toBe(false);expect(blocked('image2-0','image2-2')).toBe(false);expect(blocked('text2-0','image1-2')).toBe(false);expect(blocked('text2-0','image2-0')).toBe(true)
      }
    }
    const doc=buildRecipe('mixed-modal-mask',{format:'text-image',textTokens:2,imageTokens:3}).figure;doc.nodes.find(n=>n.id==='sequence-image1-0')!.label='Image A';const updated=updateRecipeInstance(doc,'stage',{format:'image-text'},'frame').document;expect(updated.nodes.find(n=>n.id==='sequence-image1-0')!.label).toBe('Image A');expect(checkFigureText(updated).total).toBe(0)
  })
  it('unrolls continuous latent sampling with shared conditional noise prediction and a separate state update before final decoding',()=>{
    for(const steps of [2,4]){
      const doc=buildRecipe('conditioned-denoising',{steps}).figure;expect(checkFigureText(doc).total).toBe(0)
      for(let k=0;k<steps;k++){
        for(const [id,from,to] of [[`current-to-sampler-${k}`,`latent-${k}`,`sampler-${k}`],[`current-to-noise-${k}`,`latent-${k}`,`noise-model-${k}`],[`noise-to-sampler-${k}`,`noise-model-${k}`,`sampler-${k}`],[`next-latent-${k}`,`sampler-${k}`,`latent-${k+1}`],[`condition-input-${k}`,'condition-c',`noise-model-${k}`]])expect(doc.nodes.find(n=>n.id===id)!.path).toMatchObject({start:{nodeId:from},end:{nodeId:to},arrow:'filled'})
        expect(doc.nodes.some(n=>n.path?.start?.nodeId===`noise-model-${k}`&&n.path.end?.nodeId===`latent-${k+1}`)).toBe(false)
      }
      expect(doc.nodes.find(n=>n.id==='decode-final')!.path).toMatchObject({start:{nodeId:`latent-${steps}`},end:{nodeId:'vae-decoder'}});expect(doc.nodes.filter(n=>n.path?.end?.nodeId==='vae-decoder')).toHaveLength(1)
      const current=captureComponent(doc,'denoise-process','Latent trajectory').figure;expect(current.nodes.some(n=>n.id==='condition-c')).toBe(false);expect(current.nodes.filter(n=>n.id.startsWith('noise-model-'))).toHaveLength(steps)
      const xml=new DOMParser().parseFromString(exportSvg(doc),'image/svg+xml');expect(parseDocument(JSON.parse(xml.getElementsByTagName('metadata')[0]!.textContent!))).toEqual(doc)
    }
  })
  it('keeps streaming memory read and later write states distinct and preserves both memory-encoder inputs',()=>{
    for(const [memories,prompt] of [[2,'hide'],[4,'show']] as const){
      const doc=buildRecipe('streaming-memory',{memories,prompt}).figure
      expect(checkFigureText(doc).total).toBe(0);expect(doc.nodes.filter(n=>/^past-memory-/.test(n.id))).toHaveLength(memories)
      for(const [id,from,to] of [['history-read','history-frame','memory-attention'],['image-to-memory','image-encoder','memory-encoder'],['mask-to-memory','current-mask','memory-encoder'],['memory-write','memory-encoder','updated-bank'],['next-memory-read','updated-bank','future-attention']])expect(doc.nodes.find(n=>n.id===id)!.path).toMatchObject({start:{nodeId:from},end:{nodeId:to},arrow:'filled'})
      expect(doc.nodes.some(n=>n.id==='prompt-conditioning')).toBe(prompt==='show');expect(doc.nodes.some(n=>n.path?.start?.nodeId==='updated-bank'&&n.path.end?.nodeId==='memory-attention')).toBe(false)
      if(prompt==='show'){const pts=pathPoints(doc,doc.nodes.find(n=>n.id==='history-read')!),box=doc.nodes.find(n=>n.id==='prompt-input')!;expect(pts.slice(1).some((point,i)=>segmentHitsRect(pts[i]!,point,box))).toBe(false)}
      const current=captureComponent(doc,'stream-current','Current frame').figure;expect(current.nodes.some(n=>n.id==='image-to-memory')).toBe(true);expect(current.nodes.some(n=>n.id==='memory-write')).toBe(false)
    }
    const doc=buildRecipe('streaming-memory',{memories:3,prompt:'show'}).figure;doc.nodes.find(n=>n.id==='mask-decoder')!.label='My decoder';const next=updateRecipeInstance(doc,'stage',{prompt:'hide',memories:4},'frame').document;expect(next.nodes.find(n=>n.id==='mask-decoder')!.label).toBe('My decoder');expect(next.nodes.some(n=>n.id==='prompt-input')).toBe(false)
  })
  it('preserves view identity through joint and per-view attention and keeps query-based tracking separate from dense prediction',()=>{
    for(const views of [2,4]){
      const doc=buildRecipe('alternating-view-attention',{views}).figure;expect(checkFigureText(doc).total).toBe(0)
      for(let i=0;i<views;i++){
        expect(doc.nodes.find(n=>n.id===`global-in-${i}`)!.path).toMatchObject({start:{nodeId:`input-tokens-${i}`},end:{nodeId:'global-attention'}})
        expect(doc.nodes.find(n=>n.id===`global-to-frame-${i}`)!.path).toMatchObject({start:{nodeId:'global-attention'},end:{nodeId:`frame-attention-${i}`}})
        expect(doc.nodes.find(n=>n.id===`frame-output-${i}`)!.path).toMatchObject({start:{nodeId:`frame-attention-${i}`},end:{nodeId:'updated-tokens'}})
      }
      expect(doc.nodes.some(n=>n.path?.start?.nodeId.startsWith('frame-attention-')&&n.path.end?.nodeId.startsWith('frame-attention-'))).toBe(false)
      expect(doc.nodes.find(n=>n.id==='features-to-tracker')!.path).toMatchObject({start:{nodeId:'dense-heads'},end:{nodeId:'tracking-module'}});expect(doc.nodes.find(n=>n.id==='tracking-query')!.path).toMatchObject({start:{nodeId:'query-points'},end:{nodeId:'tracking-module'}})
      const svg=new DOMParser().parseFromString(exportSvg(doc),'image/svg+xml');expect(parseDocument(JSON.parse(svg.getElementsByTagName('metadata')[0]!.textContent!))).toEqual(doc)
      const repeat=doc.containers.find(c=>c.id==='alternating-blocks')!,frame=Array.from(svg.getElementsByTagName('g')).find(g=>g.getAttribute('data-container-id')===repeat.id)!;expect(frame.getElementsByTagName('rect')[0]!.getAttribute('stroke-dasharray')).toBe(repeat.visual!.dash!.join(' '));expect(repeat.visual!.fill).toBe('none')
    }
    const doc=buildRecipe('alternating-view-attention',{views:2}).figure;doc.nodes.find(n=>n.id==='camera-token-0')!.label='cA';const next=updateRecipeInstance(doc,'stage',{views:4},'frame').document;expect(next.nodes.find(n=>n.id==='camera-token-0')!.label).toBe('cA')
  })
  it('separates distillation losses from student-only inference and transfers the trained student rather than the teacher',()=>{
    for(const hardTargets of ['show','hide']){
      const asset=buildRecipe('distillation-stages',{hardTargets}),doc=asset.figure
      expect(checkFigureText(doc).total).toBe(0);expect(doc.nodes.find(n=>n.id==='student-checkpoint')!.path).toMatchObject({start:{nodeId:'train-student'},end:{nodeId:'deploy-student'},arrow:'filled'});expect(doc.nodes.find(n=>n.id==='student-checkpoint')!.visual!.dash).toEqual([6,4]);expect(doc.nodes.find(n=>n.id==='student-update')!.path!.end!.nodeId).toBe('train-student')
      expect(doc.nodes.some(n=>n.id==='hard-loss')).toBe(hardTargets==='show');expect(doc.nodes.some(n=>n.id==='hard-labels')).toBe(hardTargets==='show');expect(doc.nodes.find(n=>n.id==='teacher-status')!.label).toContain('Frozen')
      const inference=captureComponent(doc,'distill-infer','Inference only').figure;expect(inference.nodes.map(n=>n.id)).toContain('deploy-student');expect(inference.nodes.some(n=>/loss|teacher|hard-label/.test(n.id))).toBe(false);expect(inference.nodes.filter(n=>n.path)).toHaveLength(2)
    }
    const doc=buildRecipe('distillation-stages',{hardTargets:'show'}).figure;doc.nodes.find(n=>n.id==='deploy-student')!.label='Deployed student';const updated=updateRecipeInstance(doc,'stage',{hardTargets:'hide'},'frame').document;expect(updated.nodes.find(n=>n.id==='deploy-student')!.label).toBe('Deployed student');expect(updated.nodes.some(n=>n.id==='hard-target')).toBe(false)
  })
  it('keeps visible patch membership, post-encoder masks and masked-only loss distinct from downstream encoder transfer',()=>{
    for(const parameters of [{grid:2,visible:'few'},{grid:4,visible:'half'}]){
      const doc=buildRecipe('masked-autoencoding',parameters).figure,n=parameters.grid**2,visible=new Set(Array.from({length:Math.ceil(n/(parameters.visible==='few'?4:2))},(_,i)=>i*5%n))
      expect(doc.nodes.filter(node=>/^input-patch-\d+$/.test(node.id))).toHaveLength(n);expect(doc.nodes.filter(node=>/^output-patch-\d+$/.test(node.id))).toHaveLength(n);expect(doc.nodes.filter(node=>/^visible-tile-\d+$/.test(node.id)).map(node=>node.label)).toEqual([...visible].map(i=>`p${i+1}`));expect(checkFigureText(doc).total).toBe(0)
      for(let i=0;i<n;i++)expect(doc.nodes.find(node=>node.id===`output-patch-${i}`)!.visual!.fill==='#f6f7fa').toBe(visible.has(i))
      expect(doc.nodes.find(node=>node.id==='mask-after-encoder')!.path).toMatchObject({start:{nodeId:'mask-token'},end:{nodeId:'restore-tokens'}});expect(doc.nodes.find(node=>node.id==='encode-visible')!.path).toMatchObject({start:{nodeId:'mae-encoder'},end:{nodeId:'restore-tokens'}});expect(doc.nodes.find(node=>node.id==='encoder-checkpoint')!.path).toMatchObject({start:{nodeId:'mae-encoder'},end:{nodeId:'downstream-encoder'}})
      const downstream=captureComponent(doc,'mae-downstream','Transferred encoder').figure;expect(downstream.nodes.some(node=>/mae-decoder|masked-loss|mask-token/.test(node.id))).toBe(false);expect(downstream.nodes.filter(node=>node.path)).toHaveLength(2)
      const svg=new DOMParser().parseFromString(exportSvg(doc),'image/svg+xml');expect(parseDocument(JSON.parse(svg.getElementsByTagName('metadata')[0]!.textContent!))).toEqual(doc)
    }
  })
  it('preserves local message aggregation and the distinct old-state update input at sparse and dense illustrated degrees',()=>{
    for(const neighbors of [2,5]){
      const doc=buildRecipe('graph-message-passing',{neighbors}).figure
      expect(doc.nodes.filter(n=>/^neighbor-\d+$/.test(n.id))).toHaveLength(neighbors);expect(doc.nodes.filter(n=>/^message-\d+$/.test(n.id))).toHaveLength(neighbors);expect(checkFigureText(doc).total).toBe(0)
      for(let i=0;i<neighbors;i++){
        expect(doc.nodes.find(n=>n.id===`neighbor-message-${i}`)!.path).toMatchObject({start:{nodeId:`neighbor-${i}`},end:{nodeId:'graph-v'},arrow:'filled'})
        expect(doc.nodes.find(n=>n.id===`aggregate-in-${i}`)!.path).toMatchObject({start:{nodeId:`message-${i}`},end:{nodeId:'aggregate'}})
      }
      expect(doc.nodes.find(n=>n.id==='aggregate-update')!.path!.end!.nodeId).toBe('update');expect(doc.nodes.find(n=>n.id==='old-state-link')!.path).toMatchObject({start:{nodeId:'graph-v'},end:{nodeId:'update'}});expect(doc.nodes.find(n=>n.id==='updated-state')!.path!.end!.nodeId).toBe('next-state');expect(doc.nodes.some(n=>n.id==='readout')).toBe(false)
    }
    const doc=buildRecipe('graph-message-passing',{neighbors:5}).figure;doc.nodes.find(n=>n.id==='graph-v')!.label='Target v';expect(updateRecipeInstance(doc,'stage',{neighbors:2},'frame').document.nodes.find(n=>n.id==='graph-v')!.label).toBe('Target v')
  })
  it('executes exactly one illustrative expert path and separately binds selection and gate weight without fake scores',()=>{
    for(const parameters of [{experts:2,activeExpert:1},{experts:5,activeExpert:5}]){
      const doc=buildRecipe('top1-expert-routing',parameters).figure,chosen=`expert-${parameters.activeExpert-1}`
      expect(checkFigureText(doc).total).toBe(0);expect(doc.nodes.filter(n=>/^expert-\d+$/.test(n.id))).toHaveLength(parameters.experts)
      expect(doc.nodes.find(n=>n.id==='selected-in')!.path!.end!.nodeId).toBe(chosen);expect(doc.nodes.find(n=>n.id==='selected-out')!.path!.start!.nodeId).toBe(chosen);expect(doc.nodes.find(n=>n.id==='gate-value')!.path).toMatchObject({start:{nodeId:'router'},end:{nodeId:'gate-scale'}});expect(doc.nodes.find(n=>n.id==='route-choice')!.visual!.dash).toEqual([4,3])
      for(const n of doc.nodes.filter(n=>/^expert-\d+$/.test(n.id)&&n.id!==chosen))expect(doc.nodes.some(line=>line.path?.start?.nodeId===n.id||line.path?.end?.nodeId===n.id)).toBe(false)
      const obstacles=doc.nodes.filter(n=>n.kind!=='path'&&n.kind!=='port');for(const line of doc.nodes.filter(n=>n.path))for(const seg of pathSegments(pathPoints(doc,line)))for(let k=1;k<20;k++){const x=seg.a.x+(seg.b.x-seg.a.x)*k/20,y=seg.a.y+(seg.b.y-seg.a.y)*k/20;expect(obstacles.some(n=>n.id!==line.path!.start!.nodeId&&n.id!==line.path!.end!.nodeId&&x>n.x+.01&&x<n.x+n.width-.01&&y>n.y+.01&&y<n.y+n.height-.01)).toBe(false)}
    }
    expect(()=>buildRecipe('top1-expert-routing',{experts:2,activeExpert:5})).toThrow('超过')
    const doc=buildRecipe('top1-expert-routing',{experts:5,activeExpert:2}).figure;doc.nodes.find(n=>n.id==='expert-4')!.label='Custom expert';const next=updateRecipeInstance(doc,'stage',{activeExpert:5},'frame').document
    expect(next.nodes.find(n=>n.id==='expert-4')!.label).toBe('Custom expert');expect(next.nodes.find(n=>n.id==='selected-in')!.path!.end!.nodeId).toBe('expert-4')
    const xml=new DOMParser().parseFromString(exportSvg(next),'image/svg+xml');expect(parseDocument(JSON.parse(xml.getElementsByTagName('metadata')[0]!.textContent!))).toEqual(next)
  })
  it('keeps U-shaped scale correspondence, real crop/concat branches and the shared bottleneck distinct from FPN addition',()=>{
    for(const levels of [3,5]){
      const doc=buildRecipe('unet-encoder-decoder',{levels}).figure,n=levels-1
      expect(doc.nodes.filter(node=>/^concat-\d+$/.test(node.id))).toHaveLength(n);expect(doc.nodes.filter(node=>node.label==='+')).toHaveLength(0);expect(doc.nodes.filter(node=>node.id==='bottleneck')).toHaveLength(1);expect(checkFigureText(doc).total).toBe(0)
      for(let i=0;i<n;i++){
        expect(doc.nodes.find(node=>node.id===`copy-${i}`)!.path).toMatchObject({start:{nodeId:`encoder-${i}`},end:{nodeId:`crop-${i}`},arrow:'filled'})
        expect(doc.nodes.find(node=>node.id===`crop-concat-${i}`)!.path).toMatchObject({start:{nodeId:`crop-${i}`},end:{nodeId:`concat-${i}`}})
        expect(doc.nodes.find(node=>node.id===`decode-${i}`)!.path).toMatchObject({start:{nodeId:`concat-${i}`},end:{nodeId:`decoder-${i}`}})
        expect(doc.nodes.find(node=>node.id===`pool-${i}`)!.path!.end!.nodeId).toBe(i===n-1?'bottleneck':`encoder-${i+1}`)
        expect(doc.nodes.find(node=>node.id===`up-${i}`)!.path).toMatchObject({start:{nodeId:i===n-1?'bottleneck':`decoder-${i+1}`},end:{nodeId:`concat-${i}`}})
      }
      const key=doc.nodes.find(node=>node.id==='unet-key')!,head=doc.nodes.find(node=>node.id==='output-head')!;expect(key.x+key.width).toBeLessThanOrEqual(head.x)
      const objects=doc.nodes.filter(node=>/^encoder-\d+$|^decoder-\d+$|^crop-\d+$|^concat-\d+$|^bottleneck$|^(pool|up)-label-\d+$/.test(node.id))
      for(const node of doc.nodes.filter(node=>node.path))for(const seg of pathSegments(pathPoints(doc,node)))for(const object of objects.filter(o=>o.id!==node.path!.start!.nodeId&&o.id!==node.path!.end!.nodeId))expect(segmentHitsRect(seg.a,seg.b,object),`${node.id} crosses ${object.id}`).toBe(false)
    }
    const manual=buildRecipe('unet-encoder-decoder',{levels:3}).figure,upLabel=manual.nodes.find(n=>n.id==='up-label-1')!;upLabel.label='Custom up-conv';upLabel.textStyle={...upLabel.textStyle,bold:true,color:'#845622'}
    const rebuilt=updateRecipeInstance(manual,'stage',{levels:5},'frame').document,kept=rebuilt.nodes.find(n=>n.id==='up-label-1')!
    expect(kept.label).toBe('Custom up-conv');expect(kept.textStyle).toMatchObject({bold:true,color:'#845622'});expect(kept.textStyle!.size).toBeLessThan(upLabel.textStyle!.size!);expect(checkFigureText(rebuilt).total).toBe(0)
    upLabel.textStyle!.size=17;expect(updateRecipeInstance(manual,'stage',{levels:5},'frame').document.nodes.find(n=>n.id==='up-label-1')!.textStyle).toMatchObject({size:17,bold:true,color:'#845622'})
  })
  it('preserves post-activation basic and bottleneck semantics including an explicit dimension-aligning shortcut',()=>{
    for(const parameters of [{block:'basic',shortcut:'identity'},{block:'bottleneck',shortcut:'projection'}]){
      const asset=buildRecipe('residual-block',parameters),doc=asset.figure,convs=doc.nodes.filter(node=>/^conv-\d+$/.test(node.id))
      expect(convs.map(node=>node.label.split(' conv')[0])).toEqual(parameters.block==='basic'?['3×3','3×3']:['1×1','3×3','1×1']);expect(convs.every(node=>node.label.includes('BN'))).toBe(true);expect(convs.at(-1)!.label).not.toContain('ReLU');expect(convs.slice(0,-1).every(node=>node.label.includes('ReLU'))).toBe(true)
      expect(doc.nodes.find(node=>node.id==='residual-main')!.path!.end!.nodeId).toBe('residual-sum');expect(doc.nodes.find(node=>node.id==='residual-out')!.path!.start!.nodeId).toBe('residual-sum');expect(doc.nodes.some(node=>node.id==='shortcut-projection')).toBe(parameters.shortcut==='projection');expect(doc.nodes.find(node=>node.id==='residual-formula')!.label).toContain(parameters.shortcut==='identity'?'F(x) + x':'Wₛx');expect(checkFigureText(doc).total).toBe(0)
      const shortcut=doc.nodes.find(node=>node.id===(parameters.shortcut==='identity'?'identity-shortcut':'projection-out'))!;expect(shortcut.path!.end!.nodeId).toBe('residual-sum');expect(asset.sources[0]!.reference).toContain('1512.03385')
    }
    const doc=buildRecipe('residual-block',{block:'basic',shortcut:'identity'}).figure;doc.nodes.find(node=>node.id==='conv-0')!.label='Custom operation';const next=updateRecipeInstance(doc,'stage',{block:'bottleneck',shortcut:'projection'},'frame').document
    expect(next.nodes.find(node=>node.id==='conv-0')!.label).toBe('Custom operation');expect(next.nodes.find(node=>node.id==='residual-formula')!.label).toContain('Wₛx')
    const ids=rootContainer(next).parametric!.objects;next.nodes.push({id:'external-residual-note',kind:'path',label:'Projection annotation',parentId:'stage',x:600,y:80,width:40,height:10,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none',end:{nodeId:ids['shortcut-projection']!,x:1,y:.5}}});expect(()=>updateRecipeInstance(next,'stage',{shortcut:'identity'},'frame')).toThrow('引用')
  })
  it('supports unequal terminal branches without changing inherited legacy hierarchy defaults or losing manual labels',()=>{
    const recipe=componentRecipes.find(r=>r.id==='hierarchy-tree')!,legacy=buildRecipe(recipe.id,recipe.defaults)
    expect(buildRecipe(recipe.id,{...recipe.defaults,branch1Leaves:'inherit'})).toEqual(legacy)
    for(const direction of ['down','right']){
      const doc=buildRecipe(recipe.id,{branches:4,leaves:2,direction,branch1Leaves:0,branch2Leaves:1,branch3Leaves:3,branch4Leaves:0}).figure
      expect(doc.nodes.filter(n=>n.id.startsWith('leaf-'))).toHaveLength(4);expect(doc.nodes.filter(n=>n.path)).toHaveLength(8);expect(checkFigureText(doc).total).toBe(0)
      doc.nodes.find(n=>n.id==='branch-0')!.label='Terminal category'
      const next=updateRecipeInstance(doc,'stage',{branches:2},'frame').document
      expect(next.nodes.find(n=>n.id==='branch-0')!.label).toBe('Terminal category');expect(rootContainer(next).parametric!.recipe.parameters.branch3Leaves).toBe(3)
    }
    const zero=buildRecipe(recipe.id,{branches:2,leaves:2,direction:'down',branch1Leaves:0,branch2Leaves:0}).figure
    expect(zero.nodes.filter(n=>n.path)).toHaveLength(2);expect(checkFigureText(zero).total).toBe(0)
  })
  it('copies actual selected native geometry, bindings and styles into a separately editable detail snapshot with durable provenance',()=>{
    const base=createBlank();base.nodes=[{id:'a',kind:'rectangle',label:'Real A',parentId:'stage',x:100,y:180,width:80,height:44,visual:{fill:'#123456'}},{id:'b',kind:'rectangle',label:'Real B',parentId:'stage',x:220,y:180,width:80,height:44},{id:'outside',kind:'rectangle',label:'Outside',parentId:'stage',x:100,y:350,width:80,height:44}];base.edges=[{id:'inside',source:'a',target:'b',sourcePort:'right',targetPort:'left'},{id:'external',source:'a',target:'outside',sourcePort:'bottom',targetPort:'top'}]
    const before=clone(base),request={kind:'detail-inset' as const,objectIds:['a','b'],parentId:'stage',scale:1.5,caption:'Native detail',guides:true,position:{x:450,y:180}},result=createDetailInset(base,request),copyA=result.figure.nodes.find(n=>n.id===result.aliases['a'])!
    expect(base).toEqual(before);expect(result.figure.nodes.find(n=>n.id==='a')).toEqual(base.nodes[0]);expect(copyA).toMatchObject({label:'Real A',width:120,visual:{fill:'#123456'}});expect(result.omittedEdgeIds).toEqual(['external']);expect(result.figure.edges).toHaveLength(3)
    expect(result.guideIds).toHaveLength(2);expect(result.guideIds.every(id=>result.figure.nodes.find(n=>n.id===id)!.path!.arrow==='none')).toBe(true)
    const record=result.figure.containers.find(c=>c.id===result.ownerId)!.evidence!.nativeDetail!;expect(record.requestedIds).toEqual(['a','b']);expect(record.omittedEdgeIds).toEqual(['external'])
    const material=applyMaterialEdits(base,[request]);expect(material.reports[0]!.kind).toBe('detail-inset');expect(material.reports[0]!.skipped).toHaveLength(1)
    const xml=new DOMParser().parseFromString(exportSvg(result.figure),'image/svg+xml');expect(parseDocument(JSON.parse(xml.getElementsByTagName('metadata')[0]!.textContent!))).toEqual(result.figure)
    const editor=scope.run(()=>createEditor())!;editor.figure.value=clone(base);editor.update(doc=>Object.assign(doc,result.figure));expect(editor.figure.value.nodes.length).toBe(result.figure.nodes.length);editor.undo();expect(editor.figure.value.nodes).toEqual(base.nodes)
  })
  it('rejects invalid detail targets, occupied placement, oversized snapshots and partial data charts atomically',()=>{
    const doc=createBlank();doc.nodes=[{id:'n',kind:'rectangle',label:'Native',parentId:'stage',x:100,y:180,width:140,height:64}];const before=clone(doc),request={kind:'detail-inset' as const,objectIds:['n'],parentId:'stage',scale:2,caption:'Detail',guides:false}
    expect(()=>createDetailInset(doc,{...request,position:{x:100,y:180}})).toThrow('重叠');expect(()=>createDetailInset(doc,{...request,objectIds:['stage']})).toThrow('根画板');expect(()=>createDetailInset(doc,{...request,scale:4,position:{x:800,y:400}})).toThrow();expect(doc).toEqual(before)
    const chart=componentDocument(buildDataChart(chartExample('scatter'))),node=chart.nodes.find(n=>n.kind!=='port')!
    expect(()=>createDetailInset(chart,{...request,objectIds:[node.id]})).toThrow('完整图表')
  })
  it('keeps paper structures semantically distinct and editable at representative scale and pair limits',()=>{
    for(const levels of [3,5]){
      const asset=buildRecipe('feature-pyramid',{levels}),doc=asset.figure
      expect(doc.nodes.filter(n=>n.id.startsWith('top-down-'))).toHaveLength(levels-1);expect(doc.nodes.filter(n=>n.id.startsWith('bottom-up-'))).toHaveLength(levels-1)
      expect(doc.nodes.find(n=>n.id===`merge-${levels-1}`)!.label).toBe('M');expect(doc.nodes.filter(n=>n.label==='+')).toHaveLength(levels-1);expect(checkFigureText(doc).total).toBe(0);expect(asset.sources[0]!.reference).toContain('1612.03144')
      const path=doc.nodes.find(n=>n.id==='top-down-0')!;expect(path.path).toMatchObject({start:{nodeId:'merge-1'},end:{nodeId:'merge-0'},arrow:'filled'})
      for(let i=0;i<levels-1;i++){
        const label=doc.nodes.find(n=>n.id===`upsample-${i}`)!,line=doc.nodes.find(n=>n.id===`top-down-${i}`)!,points=pathPoints(doc,line)
        expect(label.y).toBeGreaterThan(points[0]!.y);expect(label.y+label.height).toBeLessThan(points.at(-1)!.y)
        for(const node of doc.nodes.filter(n=>n.path))for(const segment of pathSegments(pathPoints(doc,node)))expect(segmentHitsRect(segment.a,segment.b,label)).toBe(false)
      }
    }
    for(const pairs of [3,5]){
      const doc=buildRecipe('dual-encoder-alignment',{pairs,objective:'symmetric'}).figure
      expect(doc.nodes.filter(n=>/^pair-\d+-\d+$/.test(n.id))).toHaveLength(pairs*pairs);expect(doc.nodes.filter(n=>/^pair-\d+-\d+$/.test(n.id)).every(n=>!n.label)).toBe(true);expect(checkFigureText(doc).total).toBe(0)
      doc.nodes.find(n=>n.id==='encoder-a')!.label='Custom image encoder';const next=updateRecipeInstance(doc,'stage',{pairs:4,objective:'alignment-only'},'frame').document
      expect(next.nodes.find(n=>n.id==='encoder-a')!.label).toBe('Custom image encoder');expect(next.nodes.some(n=>n.id==='objective')).toBe(false)
    }
  })
  it('builds two independently directed closed loops with one shared state and stable identities under asymmetric updates',()=>{
    for(const parameters of [{leftStages:2,rightStages:5,rightDirection:'counterclockwise'},{leftStages:3,rightStages:3,rightDirection:'counterclockwise'},{leftStages:5,rightStages:2,rightDirection:'clockwise'}]){
      const doc=buildRecipe('coupled-cycles',parameters).figure,shared=doc.nodes.find(n=>n.id==='shared-state')!
      expect(doc.nodes.filter(n=>n.id==='shared-state')).toHaveLength(1);expect(checkFigureText(doc).total).toBe(0)
      for(const [side,count]of [['left',parameters.leftStages],['right',parameters.rightStages]] as const){
        const links=doc.nodes.filter(n=>n.id.startsWith(`${side}-link-`)),seen=new Set<string>();let current=shared.id
        expect(links).toHaveLength(count+1)
        do{expect(seen.has(current)).toBe(false);seen.add(current);const link=links.find(n=>n.path!.start!.nodeId===current)!;expect(link).toBeDefined();current=link.path!.end!.nodeId}while(current!==shared.id)
        expect(seen.size).toBe(count+1)
        for(const link of links){
          const points=pathPoints(doc,link);expect(points.some(point=>point.c2)).toBe(true);expect(link.path!.arrow).toBe('filled')
          for(const [end,point]of [['start',points[0]!],['end',points.at(-1)!]] as const){const n=doc.nodes.find(n=>n.id===link.path![end]!.nodeId)!;expect(Math.hypot(point.x-n.x-n.width/2,point.y-n.y-n.height/2)).toBeCloseTo(n.width/2,6)}
          for(const node of doc.nodes.filter(n=>n.kind==='ellipse'&&n.id!==link.path!.start!.nodeId&&n.id!==link.path!.end!.nodeId))for(const segment of pathSegments(points))expect(Math.hypot(segment.b.x-node.x-node.width/2,segment.b.y-node.y-node.height/2)).toBeGreaterThan(node.width/2-.1)
        }
        expect(doc.nodes.find(n=>n.id===`${side}-link-0`)!.path!.end!.nodeId).toBe(side==='right'&&parameters.rightDirection==='counterclockwise'?`right-stage-${count-1}`:`${side}-stage-0`)
      }
    }
    const doc=buildRecipe('coupled-cycles',{leftStages:2,rightStages:3,rightDirection:'counterclockwise'}).figure;doc.nodes.find(n=>n.id==='shared-state')!.label='Shared memory'
    const next=updateRecipeInstance(doc,'stage',{leftStages:5},'frame').document
    expect(next.nodes.find(n=>n.id==='shared-state')!.label).toBe('Shared memory');expect(next.nodes.find(n=>n.id==='right-stage-2')!.id).toBe('right-stage-2');expect(next.nodes.find(n=>n.id===rootContainer(next).parametric!.objects['left-link-5'])!.path!.end!.nodeId).toBe('shared-state')
  })
  it('keeps swimlane ownership, sequence order and side-corridor handoffs clear of task interiors at boundary layouts',()=>{
    for(const parameters of [{lanes:2,stages:2,flow:'parallel'},{lanes:3,stages:3,flow:'handoff'},{lanes:4,stages:4,flow:'handoff'}]){
      const doc=buildRecipe('swimlane-process',parameters).figure,tasks=doc.nodes.filter(n=>n.id.startsWith('task-')),lines=doc.nodes.filter(n=>n.path)
      expect(tasks).toHaveLength(parameters.lanes*parameters.stages);expect(doc.containers.filter(c=>c.id.startsWith('lane-'))).toHaveLength(parameters.lanes);expect(doc.nodes.filter(n=>n.id.startsWith('handoff-'))).toHaveLength(parameters.flow==='handoff'?parameters.lanes-1:0);expect(checkFigureText(doc).total).toBe(0)
      for(let i=0;i<parameters.lanes;i++){
        const row=tasks.filter(n=>n.parentId===`lane-${i}`);expect(row).toHaveLength(parameters.stages)
        expect(Math.sign(row.at(-1)!.x-row[0]!.x)).toBe(parameters.flow==='handoff'&&i%2===1?-1:1)
        for(let j=0;j<parameters.stages-1;j++)expect(doc.nodes.find(n=>n.id===`lane-link-${i}-${j}`)!.path).toMatchObject({start:{nodeId:`task-${i}-${j}`},end:{nodeId:`task-${i}-${j+1}`}})
        if(parameters.flow==='handoff'&&i<parameters.lanes-1)expect(doc.nodes.find(n=>n.id===`handoff-${i}`)!.path).toMatchObject({start:{nodeId:`task-${i}-${parameters.stages-1}`},end:{nodeId:`task-${i+1}-0`}})
      }
      for(const line of lines)for(const segment of pathSegments(pathPoints(doc,line)))for(let step=0;step<=10;step++){
        const point={x:segment.a.x+(segment.b.x-segment.a.x)*step/10,y:segment.a.y+(segment.b.y-segment.a.y)*step/10}
        expect(tasks.some(n=>point.x>n.x+.01&&point.x<n.x+n.width-.01&&point.y>n.y+.01&&point.y<n.y+n.height-.01)).toBe(false)
      }
    }
  })
  it('uses actual translucent overlap for schematic sets while keeping labels in unambiguous exclusive caps',()=>{
    for(const parameters of [{sets:2,overlap:'narrow'},{sets:2,overlap:'broad'},{sets:3,overlap:'narrow'},{sets:3,overlap:'broad'}]){
      const doc=buildRecipe('set-overlap',parameters).figure,sets=doc.nodes.filter(n=>n.kind==='ellipse')
      expect(sets).toHaveLength(parameters.sets);expect(sets.every(n=>n.visual!.fillOpacity===.45&&n.label==='')).toBe(true);expect(doc.nodes.some(n=>n.chart||n.path)).toBe(false);expect(checkFigureText(doc).total).toBe(0)
      for(const [i,region]of sets.entries()){
        const label=doc.nodes.find(n=>n.id===`set-label-${i}`)!,point={x:label.x+label.width/2,y:label.y+label.height/2}
        expect(label.label).toBe(String.fromCharCode(65+i));expect(Math.hypot(point.x-region.x-region.width/2,point.y-region.y-region.height/2)).toBeLessThan(region.width/2)
        for(const other of sets.filter(n=>n!==region)){expect(Math.hypot(point.x-other.x-other.width/2,point.y-other.y-other.height/2)).toBeGreaterThan(other.width/2);expect(Math.hypot(region.x-other.x,region.y-other.y)).toBeLessThan(region.width)}
      }
      expect(exportSvg(doc)).toContain('fill-opacity="0.45"');expect(doc.nodes.find(n=>n.id==='structure-note')!.label).toContain('schematic')
    }
  })
  it('preserves independent annulus holes and core geometry for concentric contexts without hidden text',()=>{
    for(const parameters of [{layers:2,labels:'show'},{layers:3,labels:'show'},{layers:5,labels:'show'},{layers:5,labels:'hide'}]){
      const doc=buildRecipe('concentric-layers',parameters).figure,rings=doc.nodes.filter(n=>n.id.match(/^ring-\d+$/)),core=doc.nodes.find(n=>n.id==='ring-core')!
      expect(rings).toHaveLength(parameters.layers);expect(doc.nodes.filter(n=>n.id.startsWith('ring-label-'))).toHaveLength(parameters.labels==='show'?parameters.layers:0);expect(checkFigureText(doc).total).toBe(0)
      for(const [i,ring]of rings.entries()){
        expect(ring.path!.fillRule).toBe('evenodd');expect(ring.path!.points.filter(point=>point.close)).toHaveLength(2);expect(ring.path!.points.filter(point=>point.move)).toHaveLength(1)
        const segments=pathSegments(pathPoints(doc,ring)),outer=198-i*32
        for(const segment of segments){const distance=Math.hypot(segment.b.x-280,segment.b.y-282);expect(Math.min(Math.abs(distance-outer),Math.abs(distance-(outer-32)))).toBeLessThan(.06)}
      }
      expect(core.width).toBe(2*(198-parameters.layers*32));expect(core.x+core.width/2).toBe(280);expect(core.y+core.height/2).toBe(282);expect(exportSvg(doc)).toContain('fill-rule="evenodd"')
    }
  })
  it('retains swimlane sequence roles, nested path bindings and manual edits through controlled assistant changes and saved reuse',()=>{
    const asset=buildRecipe('swimlane-process',{lanes:3,stages:3,flow:'parallel'}),placed=instantiateComponent(createBlank(),scaleComponent(asset,.6),'stage'),doc=placed.document,owner=doc.containers.find(c=>c.id===placed.containerId)!,ids=owner.parametric!.objects,task=doc.nodes.find(n=>n.id===ids['task-1-0'])!
    task.label='Encode';task.visual!.fill='#123456'
    doc.nodes.push({id:'outside-leader',kind:'path',label:'Output relationship',parentId:'stage',x:700,y:240,width:40,height:20,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none',start:{nodeId:task.id,x:1,y:.5},end:{nodeId:ids['task-2-2']!,x:.5,y:0}}})
    const before=parseDocument(doc),original=clone(before),response=parseHarnessResponse(JSON.stringify({message:'Prepare lane handoffs',figure:null,recipeUpdates:[{containerId:owner.id,parameters:{flow:'handoff'},layout:'frame',reason:'Show explicit cross-lane handoffs'}]}),before),next=response.figure!,updated=next.containers.find(c=>c.id===owner.id)!,afterTask=next.nodes.find(n=>n.id===task.id)!
    expect(next.nodes.filter(n=>n.parentId===ids['lane-1']&&n.kind==='rectangle')).toHaveLength(3);expect(afterTask).toMatchObject({label:'Encode',visual:{fill:'#123456'}});expect(afterTask.x).toBeGreaterThan(task.x);expect(next.nodes.find(n=>n.id===updated.parametric!.objects['lane-link-1-0'])!.path!.start!.nodeId).toBe(task.id);expect(next.nodes.find(n=>n.id==='outside-leader')!.path!.start!.nodeId).toBe(task.id)
    expect(response.recipeUpdates![0]!.after.flow).toBe('handoff');expect(before).toEqual(original);expect(()=>updateRecipeInstance(next,owner.id,{stages:2},'frame')).toThrow('引用')
    const captured=captureComponent(next,owner.id,'Lane ownership'),copy=instantiateComponent(createBlank(),scaleComponent(captured,.8),'stage'),copyRoot=copy.document.containers.find(c=>c.id===copy.containerId)!,round=updateRecipeInstance(copy.document,copyRoot.id,{flow:'parallel'},'frame').document
    expect(round.nodes.some(n=>n.label==='Encode'&&n.visual?.fill==='#123456')).toBe(true);expect(captured.sources).toEqual(asset.sources)
    const xml=new DOMParser().parseFromString(exportSvg(next),'image/svg+xml');expect(parseDocument(JSON.parse(xml.getElementsByTagName('metadata')[0]!.textContent!))).toEqual(next)
    for(const [id,meaning]of [['coupled-cycles','share exactly one state'],['swimlane-process','real nested lane'],['set-overlap','no Boolean intersection'],['concentric-layers','evenodd holes']] as const){const info=describeCatalogue([{kind:'recipe',id}])[0]!;expect(info.structureSemantics!.relation).toContain(meaning);expect(info.sources[0]!.reference).toMatch(/PPTX SHA-256 [a-f0-9]{64}/)}
  })
  it('builds nested architecture bands with optional shared context, readable boundary layouts and explicit source provenance',()=>{
    for(const parameters of [{layers:2,modules:2,shared:'hide'},{layers:3,modules:3,shared:'show'},{layers:5,modules:4,shared:'show'}]){
      const asset=buildRecipe('layered-architecture',parameters),doc=asset.figure
      expect(doc.containers.filter(c=>c.parentId==='stage')).toHaveLength(parameters.layers)
      for(let i=0;i<parameters.layers;i++)expect(doc.nodes.filter(n=>n.parentId===`layer-${i}`&&n.kind==='rectangle')).toHaveLength(parameters.modules)
      expect(doc.nodes.some(n=>n.id==='shared-context')).toBe(parameters.shared==='show');expect(doc.edges).toEqual([]);expect(doc.nodes.some(n=>n.path||n.chart)).toBe(false);expect(checkFigureText(doc).total).toBe(0)
      expect(asset.sources[0]!.reference).toContain('第 1 页');expect(asset.sources[0]!.reference).toMatch(/PPTX SHA-256 [a-f0-9]{64}/)
    }
  })
  it('keeps hierarchy membership unarrowed in both orientations, with bound branches following moved leaves',()=>{
    for(const parameters of [{branches:2,leaves:1,direction:'down'},{branches:3,leaves:2,direction:'down'},{branches:4,leaves:3,direction:'down'},{branches:2,leaves:1,direction:'right'},{branches:4,leaves:3,direction:'right'}]){
      const doc=buildRecipe('hierarchy-tree',parameters).figure,paths=doc.nodes.filter(n=>n.path)
      expect(paths).toHaveLength(parameters.branches*(parameters.leaves+1));expect(paths.every(n=>n.path!.arrow==='none'&&n.path!.start&&n.path!.end)).toBe(true)
      expect(paths.filter(n=>n.path!.start!.nodeId==='tree-root')).toHaveLength(parameters.branches);expect(doc.nodes.filter(n=>n.id.startsWith('leaf-'))).toHaveLength(parameters.branches*parameters.leaves);expect(checkFigureText(doc).total).toBe(0)
    }
    const doc=buildRecipe('hierarchy-tree',{branches:3,leaves:2,direction:'down'}).figure,line=doc.nodes.find(n=>n.id==='branch-leaf-0-0')!,before=pathPoints(doc,line);moveObjects(doc,['leaf-0-0'],5,-4);const points=pathPoints(doc,line)
    expect(points[0]).toEqual(before[0]);expect(points.at(-1)!.x).toBeCloseTo(before.at(-1)!.x+5);expect(points.at(-1)!.y).toBeCloseTo(before.at(-1)!.y-4)
  })
  it('requires an explicit radial direction and binds each spoke to the correct central and peripheral boundaries',()=>{
    for(const [items,relation] of [[3,'none'],[6,'inward'],[8,'outward']] as const){
      const doc=buildRecipe('radial-hub',{items,relation}).figure,lines=doc.nodes.filter(n=>n.id.startsWith('spoke-'))
      expect(lines).toHaveLength(items);expect(checkFigureText(doc).total).toBe(0)
      for(const [i,line]of lines.entries()){
        expect(line.path!.arrow).toBe(relation==='none'?'none':'filled');expect(line.path!.start!.nodeId).toBe(relation==='inward'?`satellite-${i}`:'hub');expect(line.path!.end!.nodeId).toBe(relation==='inward'?'hub':`satellite-${i}`)
        const points=pathPoints(doc,line),hub=relation==='inward'?points.at(-1)!:points[0]!,peripheral=relation==='inward'?points[0]!:points.at(-1)!
        expect(Math.hypot(hub.x-250,hub.y-270)).toBeCloseTo(48);expect(Math.hypot(peripheral.x-250,peripheral.y-270)).toBeCloseTo(126)
      }
    }
  })
  it('closes cubic cycle arcs in both directions and regenerates their bindings without losing edited stage identities',()=>{
    for(const [items,direction] of [[3,'clockwise'],[4,'clockwise'],[8,'counterclockwise']] as const){
      const doc=buildRecipe('cycle-loop',{items,direction}).figure,lines=doc.nodes.filter(n=>n.id.startsWith('cycle-link-')),sign=direction==='clockwise'?1:-1
      expect(lines).toHaveLength(items);expect(checkFigureText(doc).total).toBe(0)
      for(const [i,line] of lines.entries()){
        expect(line.path!.start!.nodeId).toBe(`cycle-stage-${i}`);expect(line.path!.end!.nodeId).toBe(`cycle-stage-${(i+sign+items)%items}`)
        const points=pathPoints(doc,line),a=points[0]!,b=points.at(-1)!,tangent={x:b.c1!.x-a.x,y:b.c1!.y-a.y}
        expect(b.c2).toBeDefined();expect(line.path!.arrow).toBe('filled')
        expect(Math.sign((a.x-250)*tangent.y-(a.y-270)*tangent.x)).toBe(sign)
      }
    }
    const asset=buildRecipe('cycle-loop',{items:4,direction:'clockwise'}),doc=asset.figure;doc.nodes.find(n=>n.id==='cycle-stage-0')!.label='Review'
    const updated=updateRecipeInstance(doc,'stage',{direction:'counterclockwise'},'frame').document
    expect(updated.nodes.find(n=>n.id==='cycle-stage-0')!.label).toBe('Review');expect(updated.nodes.find(n=>n.id==='cycle-link-0')!.path!.end!.nodeId).toBe('cycle-stage-3');expect(doc.nodes.find(n=>n.id==='cycle-link-0')!.path!.end!.nodeId).toBe('cycle-stage-1')
  })
  it('distinguishes structural matrix categories from measured heatmaps and retains editable headers at asymmetric bounds',()=>{
    for(const parameters of [{rows:2,columns:2,headers:'hide'},{rows:3,columns:3,headers:'show'},{rows:4,columns:2,headers:'show'},{rows:4,columns:4,headers:'show'}]){
      const doc=buildRecipe('structure-matrix',parameters).figure
      expect(doc.nodes.filter(n=>n.id.startsWith('cell-'))).toHaveLength(parameters.rows*parameters.columns);expect(doc.nodes.filter(n=>n.id.startsWith('row-label-'))).toHaveLength(parameters.headers==='show'?parameters.rows:0);expect(doc.nodes.filter(n=>n.id.startsWith('column-label-'))).toHaveLength(parameters.headers==='show'?parameters.columns:0)
      expect(doc.nodes.some(n=>n.chart||n.path)).toBe(false);expect(doc.containers.some(c=>c.dataChart)).toBe(false);expect(checkFigureText(doc).total).toBe(0)
    }
  })
  it('builds editable closed pyramid and funnel tiers with opposite width order and no quantitative claims',()=>{
    for(const parameters of [{levels:2,profile:'pyramid'},{levels:4,profile:'pyramid'},{levels:5,profile:'funnel'}]){
      const doc=buildRecipe('tiered-pyramid',parameters).figure,tiers=doc.nodes.filter(n=>n.id.match(/^tier-\d+$/))
      expect(tiers).toHaveLength(parameters.levels);expect(doc.nodes.filter(n=>n.id.startsWith('tier-note-'))).toHaveLength(parameters.levels);expect(checkFigureText(doc).total).toBe(0)
      for(const tier of tiers)expect(tier.path!.points.at(-1)!.close).toBe(true)
      const first=pathPoints(doc,tiers[0]!),last=pathPoints(doc,tiers.at(-1)!)
      if(parameters.profile==='pyramid'){expect(first[0]!.x).toBe(first[1]!.x);expect(tiers.at(-1)!.width).toBeGreaterThan(tiers[0]!.width)}
      else{expect(first[1]!.x-first[0]!.x).toBeGreaterThan(last[2]!.x-last[3]!.x);expect(tiers[0]!.width).toBeGreaterThan(tiers.at(-1)!.width)}
      expect(doc.nodes.find(n=>n.id==='structure-note')!.label).toContain('do not encode quantities')
    }
  })
  it('reuses structural figures through assistant compilation, parameter updates, capture and reinsertion while protecting external references',()=>{
    const recipe=componentRecipes.find(r=>r.id==='layered-architecture')!,asset=buildRecipe(recipe.id,recipe.defaults),placed=instantiateComponent(createBlank(),scaleComponent(asset,.6),'stage'),doc=placed.document,owner=doc.containers.find(c=>c.id===placed.containerId)!,ids=owner.parametric!.objects,manual=doc.nodes.find(n=>n.id===ids['module-0-0'])!
    manual.label='Encoder';manual.visual!.fill='#123456'
    doc.nodes.push({id:'outside',kind:'rectangle',parentId:'stage',label:'Readout',x:760,y:200,width:100,height:44});doc.edges.push({id:'module-output',source:ids['module-2-2']!,target:'outside',sourcePort:'right',targetPort:'left'})
    const before=clone(doc),result=updateRecipeInstance(doc,owner.id,{layers:4,modules:4},'frame'),next=result.document,updated=next.containers.find(c=>c.id===owner.id)!
    expect(doc).toEqual(before);expect(next.nodes.find(n=>n.id===manual.id)).toMatchObject({label:'Encoder',visual:{fill:'#123456'}});expect(next.edges.find(e=>e.id==='module-output')).toEqual(doc.edges[0]);expect(updated.parametric!.objects['module-2-2']).toBe(ids['module-2-2']);expect(updated.parametric!.recipe.parameters).toMatchObject({layers:4,modules:4})
    expect(()=>updateRecipeInstance(next,owner.id,{modules:2},'frame')).toThrow('引用')
    const captured=parseAsset(JSON.parse(JSON.stringify(captureComponent(next,owner.id,'My architecture')))),copy=instantiateComponent(createBlank(),scaleComponent(captured,.7),'stage'),copyRoot=copy.document.containers.find(c=>c.id===copy.containerId)!
    expect(captured.sources).toEqual(asset.sources);expect(copyRoot.parametric!.objects['module-0-0']).not.toBe(manual.id);expect(updateRecipeInstance(copy.document,copyRoot.id,{modules:3},'frame').document.nodes.some(n=>n.label==='Encoder')).toBe(true)
    const source=describeCatalogue([{kind:'recipe',id:'cycle-loop'}])[0]!;expect(source.structureSemantics!.relation).toContain('last-to-first');expect(source.ports.every(port=>port.direction==='both')).toBe(true)
    const composed=composeCatalogue(createBlank(),[{kind:'recipe',id:'cycle-loop'}],[componentInstanceSchema.parse({id:'loop',componentKey:'recipe:cycle-loop',parentId:'stage',x:80,y:160,scale:.6,parameters:{items:5,direction:'counterclockwise'},labels:{'cycle-stage-0':'Review'}})],[])
    expect(composed.figure.nodes.some(n=>n.label==='Review')).toBe(true);expect(composed.used[0]!.parameters!.items).toBe(5)
    const xml=new DOMParser().parseFromString(exportSvg(next),'image/svg+xml');expect(parseDocument(JSON.parse(xml.getElementsByTagName('metadata')[0]!.textContent!))).toEqual(next)
    for(const r of componentRecipes.filter(r=>r.category==='structure'))expect(()=>buildRecipe(r.id,{...r.defaults,measurements:42})).toThrow()
  })
  it('recognizes renamed and recaptured native graphics while retaining visible text, topology, styles, paint order and raw chart values',()=>{
    const asset=buildRecipe('pipeline',{stages:2,direction:'row'}),before=clone(asset),copy=captureComponent(componentDocument(asset),'stage',asset.name)
    copy.name='Another index name';copy.description='Another catalogue description';copy.sources.push({title:'Different paper source',reference:'Authored source B'});copy.updatedAt='2026-10-30T09:00:00.000Z'
    expect(componentSnapshotJson(copy)).not.toBe(componentSnapshotJson(asset));expect(componentContentJson(copy)).toBe(componentContentJson(asset));expect(asset).toEqual(before)
    for(const mutate of [(a:typeof asset)=>{a.figure.nodes[0]!.label='Changed visible label'},(a:typeof asset)=>{a.figure.edges[0]!.sourcePort='top'},(a:typeof asset)=>{a.figure.style.fontFamily='Patrick Hand'},(a:typeof asset)=>{a.figure.nodes.reverse()}]){const changed=clone(asset);mutate(changed);expect(componentContentJson(changed)).not.toBe(componentContentJson(asset))}
    const chart=buildDataChart(chartExample('line')),recaptured=captureComponent(componentDocument(chart),'stage',chart.name);expect(componentContentJson(recaptured)).toBe(componentContentJson(chart));recaptured.figure.containers[0]!.dataChart!.spec.series[0]!.values[0]!+=1e-9;expect(componentContentJson(recaptured)).not.toBe(componentContentJson(chart))
  })
  it('updates recipe roles with stable output bindings, hand edits and provenance through capture and reinsertion',()=>{
    const asset=scaleComponent(buildRecipe('mlp',{inputs:2,hiddenLayers:1,hidden:3,outputs:2}),.5),placed=instantiateComponent(createBlank(),asset,'stage'),doc=placed.document,owner=doc.containers.find(c=>c.id===placed.containerId)!,output=doc.nodes.find(n=>n.id===owner.parametric!.objects['neuron-2-0'])!
    output.label='Human logits';output.textStyle={...output.textStyle,bold:true};output.visual={...output.visual,fill:'#112233'}
    doc.nodes.push({id:'outside',parentId:'stage',kind:'module',label:'Loss',x:700,y:220,width:100,height:60});doc.edges.push({id:'external',source:output.id,target:'outside',sourcePort:'right',targetPort:'left'})
    const before=clone(doc),result=updateRecipeInstance(doc,owner.id,{hiddenLayers:2}),next=result.document,updated=next.containers.find(c=>c.id===owner.id)!
    expect(doc).toEqual(before);expect(updated.parametric!.objects['neuron-3-0']).toBe(output.id);expect(updated.parametric!.objects['neuron-2-0']).not.toBe(output.id);expect(next.edges.find(e=>e.id==='external')).toEqual(doc.edges.find(e=>e.id==='external'));expect(next.nodes.find(n=>n.id===output.id)).toMatchObject({label:'Human logits',textStyle:{bold:true},visual:{fill:'#112233'}})
    expect(updated.parametric!.recipe.parameters.hiddenLayers).toBe(2);expect(updated.component!.recipe!.parameters.hiddenLayers).toBe(1);expect(updated.parametric!.revision).toBe(1)
    const parameterDiff=diffFigures(doc,next).changes.find(change=>change.id===owner.id)!.fields.find(field=>field.name==='组合参数')!;expect(parameterDiff.before).toContain('"hiddenLayers":1');expect(parameterDiff.after).toContain('"hiddenLayers":2');expect(parameterDiff.after).not.toContain(output.id)
    const captured=captureComponent(next,owner.id,'Editable network'),copy=instantiateComponent(createBlank(),scaleComponent(captured,.8),'stage').document,copyRoot=copy.containers.find(c=>c.parametric)!
    expect(rootContainer(captured.figure).parametric!.objects.stage).toBe('stage');expect(copyRoot.parametric!.objects.stage).toBe(copyRoot.id);expect(()=>updateRecipeInstance(copy,copyRoot.id,{hiddenLayers:1})).not.toThrow()
    const omitted=clone(next);delete omitted.containers.find(c=>c.id===owner.id)!.parametric;expect(parseHarnessResponse(JSON.stringify({message:'Move labels',figure:omitted}),next).figure!.containers.find(c=>c.id===owner.id)!.parametric).toEqual(updated.parametric)
    const forged=clone(next);forged.containers.find(c=>c.id===owner.id)!.parametric!.revision++;expect(()=>parseHarnessResponse(JSON.stringify({message:'Forged',figure:forged}),next)).toThrow('参数化图元')
    const editor=scope.run(createEditor)!;editor.figure.value=clone(doc);editor.figure.value.title='Concurrent edit';expect(editor.applyRecipePreview(result)).toBe(false);expect(editor.past.value).toHaveLength(0);editor.figure.value=clone(doc);expect(editor.applyRecipePreview(result)).toBe(true);expect(editor.figure.value).toEqual(editableFigure(next));editor.undo();expect(editor.figure.value).toEqual(doc)
  })
  it('refits native recipe geometry while retaining annotations, named ports, path targets and drawing order',()=>{
    const placed=instantiateComponent(createBlank(),scaleComponent(buildRecipe('tensor-stack',{layers:5,rows:4,columns:5,spacing:'normal',tilt:'steep',note:'show'}),.6),'stage'),doc=placed.document,owner=doc.containers.find(c=>c.id===placed.containerId)!,state=owner.parametric!,output=doc.nodes.find(n=>n.id===state.objects.output)!
    output.label='Representations';output.socket!.key='representations';output.socket!.position=.7
    doc.nodes.push({id:'manual-note',parentId:owner.id,kind:'text',label:'Human annotation',x:owner.x+10,y:owner.y+10,width:100,height:18},{id:'manual-port',parentId:owner.id,interfaceFor:owner.id,kind:'port',label:'Context',x:owner.x,y:owner.y,width:owner.width,height:owner.height,socket:{key:'context',side:'top',direction:'input',position:.3}},{id:'leader',parentId:'stage',kind:'path',label:'Leader',x:600,y:200,width:100,height:20,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none',end:{nodeId:state.objects['plane-0']!,anchorIndex:0}}})
    const before=parseDocument(doc),result=updateRecipeInstance(before,owner.id,{layers:7,columns:6},'frame'),after=result.document,root=after.containers.find(c=>c.id===owner.id)!
    expect(root).toMatchObject({x:owner.x,y:owner.y,width:owner.width,height:owner.height});expect(after.nodes.find(n=>n.id==='manual-note')).toEqual(before.nodes.find(n=>n.id==='manual-note'));expect(after.nodes.at(-1)!.id).toBe('leader');expect(after.nodes.findIndex(n=>n.id==='manual-note')).toBeGreaterThan(after.nodes.findIndex(n=>n.id===root.parametric!.objects['grid-column-5']))
    expect(after.nodes.find(n=>n.id===output.id)).toMatchObject({label:'Representations',socket:{key:'representations',position:.7}});expect(after.nodes.filter(n=>n.socket)).toHaveLength(3);expect(after.nodes.find(n=>n.id==='leader')!.path!.end).toEqual(before.nodes.find(n=>n.id==='leader')!.path!.end);expect(result.factor).toBeLessThan(.6);expect(result.preserved).toBe(2)
    const grid=after.nodes.find(n=>n.id===root.parametric!.objects['grid-column-5'])!,front=after.nodes.find(n=>n.id===root.parametric!.objects['plane-6'])!;expect((grid.x-front.x)/front.width).toBeCloseTo(5/6);expect(grid.height).toBeCloseTo(120*result.factor);expect(()=>parseDocument(after)).not.toThrow();expect(updateRecipeInstance(after,owner.id,root.parametric!.recipe.parameters).changed).toBe(false)
  })
  it('refuses removal of referenced managed objects and broken source mappings atomically',()=>{
    const placed=instantiateComponent(createBlank(),scaleComponent(buildRecipe('pipeline',{stages:3,direction:'row'}),.6),'stage'),doc=placed.document,owner=doc.containers.find(c=>c.id===placed.containerId)!,last=owner.parametric!.objects['step-2']!
    doc.nodes.push({id:'outside',parentId:'stage',kind:'module',label:'Outside',x:700,y:250,width:100,height:60});doc.edges.push({id:'boundary',source:last,target:'outside',sourcePort:'right',targetPort:'left'});const original=clone(doc)
    expect(()=>updateRecipeInstance(doc,owner.id,{stages:2})).toThrow('引用');expect(doc).toEqual(original)
    doc.edges=doc.edges.filter(e=>e.id!=='boundary');doc.nodes.push({id:'leader',parentId:'stage',kind:'path',label:'Lead',x:650,y:240,width:100,height:40,path:{points:[{x:0,y:0},{x:1,y:1}],arrow:'none',start:{nodeId:last,x:1,y:.5}}});expect(()=>updateRecipeInstance(doc,owner.id,{stages:2})).toThrow('引用')
    const broken=clone(original);broken.nodes=broken.nodes.filter(n=>n.id!==last);broken.edges=broken.edges.filter(e=>e.source!==last&&e.target!==last);expect(()=>updateRecipeInstance(broken,owner.id,{stages:4})).toThrow('已删除或移出');expect(()=>updateRecipeInstance(original,owner.id,{unsupported:1})).toThrow('不支持')
  })
  it('captures cross-parent native fragments without mutating the source, preserving scoped colours and geometry while detaching only external bindings',async()=>{
    const doc=createBlank();doc.containers.push({id:'left',parentId:'stage',title:'Left',role:'component',x:70,y:160,width:300,height:300,visual:{fill:'none',stroke:'none'},appearance:{preset:'precise',accent:'blue',paletteId:'figureforge-classic',colorIndex:1},opacity:.5},{id:'right',parentId:'stage',title:'Right',role:'component',x:450,y:160,width:300,height:300,visual:{fill:'none',stroke:'none'},appearance:{preset:'precise',accent:'blue',paletteId:'figureforge-publication-soft',colorIndex:2},opacity:.8})
    doc.nodes=[{id:'a',parentId:'left',kind:'rectangle',label:'Features',x:100,y:200,width:100,height:60},{id:'b',parentId:'left',kind:'ellipse',label:'Unselected',x:270,y:340,width:50,height:50},{id:'c',parentId:'right',kind:'ellipse',label:'Output',x:500,y:250,width:100,height:60},{id:'curve',parentId:'left',kind:'path',label:'Leader',x:200,y:230,width:70,height:135,path:{points:[{x:0,y:0},{x:1,y:1,c1:{x:.4,y:0},c2:{x:.6,y:1}}],arrow:'open',start:{nodeId:'a',x:1,y:.5},end:{nodeId:'b',x:0,y:.5}}}]
    doc.edges=[{id:'inside',source:'a',target:'c',sourcePort:'right',targetPort:'left'},{id:'outside',source:'a',target:'b',sourcePort:'bottom',targetPort:'left'}]
    const source=parseDocument(doc),before=clone(source),points=pathPoints(source,source.nodes.find(n=>n.id==='curve')!),result=await captureObjectSelection(source,['a','curve','c'],{name:'Frozen fragment',description:'Native capture',tags:'features, 图示',sources:[]},{kind:'project'}),asset=result.asset,copy=asset.figure
    expect(source).toEqual(before);expect(copy.nodes.map(n=>n.id)).toEqual(['a','c','curve']);expect(copy.edges.map(e=>e.id)).toEqual(['inside']);expect(result.report.omittedEdgeIds).toEqual(['outside']);expect(result.report.detachedEndpoints).toEqual([{nodeId:'curve',end:'end'}]);expect(copy.nodes.find(n=>n.id==='curve')!.path!.start?.nodeId).toBe('a');expect(copy.nodes.find(n=>n.id==='curve')!.path!.end).toBeUndefined()
    for(const id of ['a','c']){expect(resolveStyle(copy,id)).toEqual(resolveStyle(source,id));expect(copy.containers.find(c=>c.id===copy.nodes.find(n=>n.id===id)!.parentId)!.opacity).toBe(id==='a' ? .5 : .8)}
    const dx=copy.nodes.find(n=>n.id==='a')!.x-source.nodes.find(n=>n.id==='a')!.x,dy=copy.nodes.find(n=>n.id==='a')!.y-source.nodes.find(n=>n.id==='a')!.y,newPoints=pathPoints(copy,copy.nodes.find(n=>n.id==='curve')!)
    expect(newPoints.map(p=>({x:p.x-dx,y:p.y-dy}))).toEqual(points.map(p=>({x:p.x,y:p.y})));expect(copy.containers.every(c=>c.role==='component'&&c.visual?.fill==='none')).toBe(true)
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(collectionSelectionJson(result.collection))))].map(v=>v.toString(16).padStart(2,'0')).join('');expect(result.collection.selectionSha256).toBe(hash);expect(result.collection.scopeIds).toEqual(['left','right','stage']);expect(()=>parseAsset(JSON.parse(JSON.stringify(asset)))).not.toThrow();expect(exportSvg(componentDocument(asset))).toContain(result.collection.figureSha256)
    const invalid=clone(source);await expect(captureObjectSelection(invalid,['missing'],{name:'Bad',description:'',tags:'',sources:[]},{kind:'project'})).rejects.toThrow('存在');expect(invalid).toEqual(before)
  })
  it('captures whole native interfaces and ancestor composite opacity with immutable candidate identity through reuse',async()=>{
    const original=buildRecipe('tensor-stack',{layers:5,rows:4,columns:5,spacing:'normal',tilt:'steep',note:'show'}),doc=instantiateComponent(createBlank(),original,'stage').document;doc.containers[0]!.role='component';doc.containers[0]!.visual={fill:'none',stroke:'none'};doc.containers[0]!.opacity=.4
    const group=doc.containers.find(c=>c.parentId==='stage')!,before=clone(doc),runId=crypto.randomUUID(),result=await captureObjectSelection(doc,[group.id],{name:'Collected layers',description:'',tags:'tensor',sources:[]},{kind:'candidate',runId,review:'pending'})
    expect(doc).toEqual(before);expect(result.asset.figure.nodes.filter(n=>n.socket)).toHaveLength(2);expect(rootContainer(result.asset.figure).opacity).toBe(.4);expect(result.collection).toMatchObject({kind:'candidate',runId,review:'pending'});expect(result.asset.sources.some(s=>s.title===original.sources[0]!.title)).toBe(true)
    const inserted=instantiateComponent(createBlank(),scaleComponent(result.asset,.6),'stage').document,captured=captureComponent(inserted,inserted.containers.find(c=>c.parentId==='stage')!.id,'Again');expect(captured.sources.find(s=>s.collection)?.collection).toEqual(result.collection)
    const port=doc.nodes.find(n=>n.socket)!;await expect(captureObjectSelection(doc,[port.id],{name:'Orphan',description:'',tags:'',sources:[]},{kind:'project'})).rejects.toThrow('所属容器')
  })
  it('refuses partial managed data charts and keeps complete original observations when collecting the whole chart',async()=>{
    const chart=buildDataChart(chartExample('line')),source=clone(chart.figure),draft={name:'Collected data view',description:'',tags:'chart',sources:[]}
    await expect(captureObjectSelection(source,[source.nodes[0]!.id],draft,{kind:'project'})).rejects.toThrow('完整图表');expect(source).toEqual(chart.figure)
    const result=await captureObjectSelection(source,['stage'],draft,{kind:'project'});expect(rootContainer(result.asset.figure).dataChart).toEqual(rootContainer(source).dataChart);expect(result.asset.figure.nodes).toEqual(source.nodes);expect(result.report.internalEdges).toBe(source.edges.length)
  })
  it('builds editable patch tokenization with shared projection, explicit class/position branches and symbolic dimensions independent of shown counts',()=>{
    // Boundary layouts plus independent optional branches; avoid the full Cartesian product.
    const layouts = [[2,'show','learned','show'],[4,'show','learned','show'],[3,'hide','learned','hide'],[3,'show','none','hide'],[3,'hide','none','show'],[4,'hide','none','hide']] as const
    for(const [grid,classToken,position,details] of layouts){
      const asset=buildRecipe('patch-embedding',{grid,classToken,position,details}),doc=asset.figure,n=grid*grid,cls=classToken==='show'
      expect(doc.nodes.filter(node=>node.name?.startsWith('Shown patch '))).toHaveLength(n);expect(doc.nodes.filter(node=>node.name?.startsWith('Flatten: '))).toHaveLength(n);expect(doc.nodes.filter(node=>node.name?.startsWith('Sequence: '))).toHaveLength(n+(cls?1:0));expect(doc.nodes.filter(node=>node.name?.startsWith('Encoder input: '))).toHaveLength(n+(cls?1:0))
      expect(doc.nodes.some(node=>node.id==='class-parameter')).toBe(cls);expect(doc.nodes.some(node=>node.id==='add-position')).toBe(position==='learned');expect(doc.nodes.some(node=>node.id==='patch-formula')).toBe(details==='show');expect(doc.nodes.some(node=>node.kind==='module'||node.structure||node.chart)).toBe(false)
      if(cls){expect(doc.edges.find(edge=>edge.id==='class-to-prepend')).toMatchObject({source:'class-parameter',target:'prepend-class'});expect(doc.nodes.find(node=>node.id==='sequence-cls')!.label).toBe('[CLS]')}
      if(position==='learned')expect(doc.edges.find(edge=>edge.id==='position-to-add')).toMatchObject({source:'position-matrix',target:'add-position'})
      for(const node of doc.nodes.filter(node=>node.kind!=='port'))expect(contains(contentBounds(doc.containers.find(c=>c.id===node.parentId)!),node),node.id).toBe(true)
      expect(doc.nodes.filter(node=>node.socket).map(node=>node.socket!.key)).toEqual(['image-in','tokens-out']);expect(doc.nodes.length).toBeLessThanOrEqual(240);expect(rootContainer(doc).width).toBeLessThanOrEqual(1000);expect(rootContainer(doc).height).toBeLessThanOrEqual(620);expect(checkFigureText(doc).issues).toEqual([]);expect([...routeFigure(doc).values()].every(route=>route.status==='clear')).toBe(true)
    }
    const asset=buildRecipe('patch-embedding',{grid:3,classToken:'show',position:'learned',details:'show'}),doc=asset.figure,row=doc.nodes.find(node=>node.id==='flat-1')!,line=doc.nodes.find(node=>node.id==='flat-1-first')!,point=pathPoints(doc,line)[0]!
    moveObjects(doc,[row.id],2,0);expect(pathPoints(doc,line)[0]!.x).toBeCloseTo(point.x+2);doc.nodes.find(node=>node.id==='patch-title')!.label='Hand-edited patch input'
    const frozen=clone(asset),captured=captureComponent(componentDocument(asset),'stage','Saved patch input'),scaled=scaleComponent(captured,.6),placed=instantiateComponent(createBlank(),scaled,'stage',true).document;expect(placed.nodes.some(node=>node.label==='Hand-edited patch input')).toBe(true);expect(placed.nodes.filter(node=>node.socket)).toHaveLength(2);expect(asset).toEqual(frozen);expect(()=>parseDocument(placed)).not.toThrow();expect(exportSvg(placed)).toContain('HW/P²')
    const info=describeCatalogue([{kind:'recipe',id:'patch-embedding'}])[0]!;expect(info.sources[0]!.reference).toContain('2010.11929v2')
    const assembled=composeCatalogue(createBlank(),[{kind:'recipe',id:'patch-embedding'}],[componentInstanceSchema.parse({id:'patches',componentKey:'recipe:patch-embedding',parentId:'stage',x:80,y:170,fit:{width:800,height:350},parameters:{grid:2,classToken:'hide',position:'none'},labels:{'patch-title':'Editable patches'}})],[]);expect(assembled.used[0]!.parameters).toMatchObject({grid:2,classToken:'hide',position:'none'});expect(assembled.figure.nodes.some(node=>node.label==='Editable patches')).toBe(true)
    const invalidParameters:Record<string,string|number>[]=[{grid:1},{grid:5},{position:'sinusoidal'},{imageWidth:224}]
    for(const patch of invalidParameters)expect(()=>buildRecipe('patch-embedding',{grid:3,classToken:'show',position:'learned',details:'show',...patch})).toThrow()
  })
  it('keeps single-head attention order, transposed-key interfaces and causal geometry explicit across grid bounds, capture and scaling',()=>{
    for(const mask of ['none','causal'])for(const [tokens,channels,details]of [[3,2,'hide'],[4,4,'show'],[6,5,'show']] as const){
      const asset=buildRecipe('scaled-attention',{tokens,channels,mask,details}),doc=asset.figure
      expect(doc.containers).toHaveLength(6);expect(doc.containers.some(c=>c.dataChart)).toBe(false);expect(doc.nodes.filter(n=>n.id.startsWith('masked-'))).toHaveLength(mask==='causal'?tokens*(tokens-1)/2:0)
      expect(doc.nodes.filter(n=>n.id.endsWith('-dimensions'))).toHaveLength(details==='show'?5:0);expect(doc.nodes.find(n=>n.id==='attention-formula')!.label).toBe(mask==='causal'?'A = softmax(QKᵀ / √dₖ + M), Y = AV':'A = softmax(QKᵀ / √dₖ), Y = AV')
      expect(doc.nodes.filter(n=>n.socket).map(n=>n.socket!.key)).toEqual(['query-in','key-transpose-in','values-in','attention-out']);expect(doc.edges.find(e=>e.id==='to-softmax')!.source).toBe(mask==='causal'?'causal-mask':'score-scale');expect(doc.edges.find(e=>e.id==='values-to-product')).toMatchObject({source:'values-frame',target:'weighted-values'})
      expect([...routeFigure(doc).values()].every(r=>r.status==='clear')).toBe(true);expect(checkFigureText(doc).issues).toEqual([]);expect(asset.sources[0]!.reference).toContain('并非原图描摹')
    }
    const asset=buildRecipe('scaled-attention',{tokens:4,channels:4,mask:'causal',details:'show'}),doc=asset.figure,frame=doc.nodes.find(n=>n.id==='weights-frame')!,hatch=doc.nodes.find(n=>n.id==='masked-0-1')!,old=pathPoints(doc,hatch)
    moveObjects(doc,[frame.id],2,0);expect(pathPoints(doc,hatch)[0]!.x).toBeCloseTo(old[0]!.x+2);expect(pathPoints(doc,hatch)[1]!.x).toBeCloseTo(old[1]!.x+2)
    const saved=importComponentText(JSON.stringify(captureComponent(componentDocument(asset),'stage','Edited attention'))),scaled=scaleComponent(saved,.65),placed=instantiateComponent(createBlank(),scaled,'stage',true).document
    expect(placed.nodes.filter(n=>n.socket)).toHaveLength(4);expect(placed.edges).toHaveLength(doc.edges.length);expect(exportSvg(placed)).toContain('QKᵀ');expect(()=>parseDocument(placed)).not.toThrow()
    const invalid:Record<string,string|number>[]=[{tokens:2},{channels:6},{mask:'bidirectional'},{actualWeights:1}];for(const patch of invalid)expect(()=>buildRecipe('scaled-attention',{tokens:4,channels:4,mask:'none',details:'show',...patch})).toThrow()
    const info=describeCatalogue([{kind:'recipe',id:'scaled-attention'}])[0]!;expect(info.attentionSemantics!.inputs).toContain('not K');expect(info.attentionSemantics!.counts).toContain('d_k and d_v need not be equal')
    const assembled=composeCatalogue(createBlank(),[{kind:'recipe',id:'scaled-attention'}],[componentInstanceSchema.parse({id:'attention',componentKey:'recipe:scaled-attention',parentId:'stage',x:80,y:160,scale:.7,keepAppearance:true,parameters:{mask:'causal',tokens:3},labels:{'attention-label':'Editable single-head attention'}})],[])
    expect(assembled.used[0]!.parameters).toMatchObject({mask:'causal',tokens:3});expect(assembled.nodeAliases.attention!['key-in']).toBeDefined();expect(assembled.figure.nodes.some(n=>n.label==='Editable single-head attention')).toBe(true);expect([...routeFigure(assembled.figure).values()].every(r=>r.status==='clear')).toBe(true)
  })
  it('builds bounded independent tensor planes and schematic grids at minimum, default and maximum layouts, preserving hand edits and named interfaces',()=>{
    const defaults={layers:5,rows:4,columns:5,spacing:'normal',tilt:'steep',note:'show'}
    for(const parameters of [defaults,{...defaults,layers:1,rows:2,columns:2,tilt:'flat'},{...defaults,layers:8,rows:8,columns:8,spacing:'loose'},{...defaults,layers:3,tilt:'mild',note:'hide'}]){
      const asset=buildRecipe('tensor-stack',parameters),doc=asset.figure,root=rootContainer(doc)
      expect(root).toMatchObject({role:'component',visual:{fill:'none',stroke:'none'}});expect(doc.nodes.filter(n=>n.id.startsWith('plane-'))).toHaveLength(parameters.layers);expect(doc.nodes.filter(n=>n.id.startsWith('grid-column-'))).toHaveLength(parameters.columns-1);expect(doc.nodes.filter(n=>n.id.startsWith('grid-row-'))).toHaveLength(parameters.rows-1)
      for(const node of doc.nodes.filter(n=>n.kind!=='port'))expect(contains(contentBounds(root),node),node.id).toBe(true)
      for(const node of doc.nodes.filter(n=>n.path)){const points=pathCoordinates(pathPoints(doc,node));expect(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);expect(points.every(p=>p.x>=2&&p.y>=2&&p.x<=root.width-2&&p.y<=root.height-2)).toBe(true)}
      expect(doc.nodes.filter(n=>n.socket).map(n=>n.socket!.key)).toEqual(['features-in','features-out']);expect(doc.edges).toEqual([]);expect(asset.sources[0]!.reference).toContain('不代表观测');expect(doc.containers.some(c=>c.dataChart)).toBe(false)
    }
    const asset=buildRecipe('tensor-stack',defaults);asset.figure.nodes.find(n=>n.id==='tensor-label')!.label='Human embeddings';asset.figure.nodes.find(n=>n.id==='plane-0')!.visual!.stroke='#123456'
    const frozen=clone(asset),saved=importComponentText(JSON.stringify(captureComponent(componentDocument(asset),'stage','Edited tensor'))),scaled=scaleComponent(saved,.75),inserted=instantiateComponent(createBlank(),scaled,'stage',true).document
    expect(inserted.nodes.find(n=>n.kind==='text'&&n.label==='Human embeddings')).toBeDefined();expect(inserted.nodes.some(n=>n.visual?.stroke==='#123456')).toBe(true);expect(inserted.nodes.filter(n=>n.socket).map(n=>n.socket!.key)).toEqual(['features-in','features-out']);expect(asset).toEqual(frozen)
    const invalidPatches:Record<string,string|number>[]=[{layers:9},{rows:1},{spacing:'unknown'},{observations:3}];for(const patch of invalidPatches)expect(()=>buildRecipe('tensor-stack',{...defaults,...patch})).toThrow()
    const composed=composeCatalogue(createBlank(),[{kind:'recipe',id:'tensor-stack'}],[componentInstanceSchema.parse({id:'left-stack',componentKey:'recipe:tensor-stack',parentId:'stage',x:80,y:160,keepAppearance:true,labels:{'tensor-label':'','schematic-note':''}}),{id:'right-stack',componentKey:'recipe:tensor-stack',parentId:'stage',x:480,y:160,keepAppearance:true}],[{id:'features',source:{scope:'port',instanceId:'left-stack',port:'output',key:'features-out',index:0},target:{scope:'port',instanceId:'right-stack',port:'input',key:'features-in',index:0},sourcePort:'right',targetPort:'left'}])
    const edge=composed.figure.edges[0]!;expect(composed.figure.nodes.find(n=>n.id===edge.source)?.socket?.key).toBe('features-out');expect(composed.figure.nodes.find(n=>n.id===edge.target)?.socket?.key).toBe('features-in');expect(composed.figure.nodes.filter(n=>n.parentId==='left-stack'&&n.kind==='text').map(n=>n.label)).toEqual(['','']);expect(composed.figure.nodes.find(n=>n.parentId==='right-stack'&&n.kind==='text')?.label).toBe('Tensor features')
  })
  it('uses semantic filled paths consistently while preserving unfilled paths, manual RGB and simultaneous theme mappings',()=>{
    const doc=catalogueAsset({kind:'recipe',id:'tensor-stack'}).figure,face=doc.nodes.find(n=>n.id==='plane-0')!,before=clone(doc.nodes),first=pathFill(doc.style,face.visual)
    expect(first).toBe(figurePaint(doc.style).hatch);expect(nodeVisual(face,doc)[0]!.attrs!.fill).toBe(first);expect(pathFill(doc.style,undefined)).toBe('none')
    face.visual!.stroke='#123456';const slot=colorSlotInventory(doc)[0]!;expect(slot.sourceIndex).toBe(1)
    setContainerColorMap(doc,'stage',[{sourcePaletteId:slot.sourcePaletteId,sourceIndex:slot.sourceIndex,targetPaletteId:slot.sourcePaletteId,targetIndex:0,role:'Features'}]);const mapped=pathFill(doc.style,face.visual);expect(mapped).not.toBe(first);expect(nodeVisual(face,doc)[0]!.attrs!.fill).toBe(mapped)
    expect(doc.nodes.filter(n=>n.path).map(n=>n.path)).toEqual(before.filter(n=>n.path).map(n=>n.path));expect(exportSvg(doc)).toContain(`fill="${mapped}"`);
    face.visual!.fill='#abcdef';expect(pathFill(doc.style,face.visual)).toBe('#abcdef');expect(nodeVisual(face,doc)[0]!.attrs!.stroke).toBe('#123456')
    expect(describeCatalogue([{kind:'recipe',id:'tensor-stack'}])[0]!.illustrativeGeometry!.counts).toContain('not observations')
  })
  it('keeps minimum, default, maximum and asymmetric network layouts connected and bounded', () => {
    const layouts = [[2,1,2,1],[3,2,3,2],[4,3,4,3],[2,3,4,1],[4,1,2,3]] as const
    for (const [inputs,hiddenLayers,hidden,outputs] of layouts) {
      const asset = buildRecipe('mlp', { inputs, hiddenLayers, hidden, outputs })
      expect(asset.figure.nodes).toHaveLength(inputs + hiddenLayers * hidden + outputs)
      expect(asset.figure.edges).toHaveLength(inputs * hidden + (hiddenLayers - 1) * hidden * hidden + hidden * outputs)
      const neighbors = new Map<string, Set<string>>()
      for (const edge of asset.figure.edges) {
        expect(edge.sourcePort).toBe('right'); expect(edge.targetPort).toBe('left')
        const targets = neighbors.get(edge.source) ?? new Set(); targets.add(edge.target); neighbors.set(edge.source, targets)
      }
      expect(neighbors.size).toBe(inputs + hiddenLayers * hidden)
      const blank=createBlank(),room=contentBounds(rootContainer(blank)),size=rootContainer(asset.figure)
      if(size.width<=room.width&&size.height<=room.height)expect(()=>parseDocument(instantiateComponent(blank,asset,'stage').document)).not.toThrow()
      else expect(()=>instantiateComponent(blank,asset,'stage')).toThrow('没有足够空位')
      expect(()=>parseDocument(componentDocument(asset))).not.toThrow()
      const area = contentBounds(rootContainer(asset.figure))
      expect(asset.figure.nodes.every(n => contains(area, n))).toBe(true)
    }
  })
  it('builds boundary fusion and pipeline layouts with both primitive types and directions', () => {
    for (const [branches,operator,feature] of [[2,'sum','tensor'],[4,'sum','volume'],[2,'concat','volume'],[4,'concat','tensor']] as const) {
      const asset = buildRecipe('fusion', { branches, operator, feature })
      expect(asset.figure.nodes.filter(n => n.kind === feature)).toHaveLength(branches + 1)
      expect(asset.figure.nodes.find(n => n.kind === 'operator')?.label).toBe(operator === 'sum' ? '+' : 'C')
      expect(asset.figure.edges).toHaveLength(branches + 1)
      expect(() => instantiateComponent(createBlank(), asset, 'stage')).not.toThrow()
    }
    for (const [stages,direction] of [[2,'row'],[5,'row'],[2,'column'],[5,'column']] as const) {
      const asset = buildRecipe('pipeline', { stages, direction })
      expect(asset.figure.nodes).toHaveLength(stages)
      expect(asset.figure.edges).toHaveLength(stages - 1)
      expect(asset.figure.edges.every(e => e.sourcePort === (direction === 'row' ? 'right' : 'bottom'))).toBe(true)
      expect(() => instantiateComponent(createBlank(), asset, 'stage')).not.toThrow()
    }
    expect(() => buildRecipe('mlp', { inputs: 100, hidden: 3, hiddenLayers: 1, outputs: 2 })).toThrow()
    expect(() => buildRecipe('pipeline', { stages: 2.5, direction: 'row' })).toThrow()
  })
  it('reuses the same asset with fresh IDs, non-overlapping placement and independent edge bindings', () => {
    const original = createBlank(), before = clone(original)
    const first = instantiateComponent(original, pipeline(), 'stage')
    const second = instantiateComponent(first.document, pipeline(), 'stage')
    expect(original).toEqual(before)
    const all = [...second.document.containers, ...second.document.nodes, ...second.document.edges]
    expect(new Set(all.map(o => o.id)).size).toBe(all.length)
    const [a, b] = second.document.containers.filter(c => c.id !== 'stage')
    expect(b!.x).toBeGreaterThanOrEqual(a!.x + a!.width + 16)
    for (const edge of second.document.edges) {
      const source = second.document.nodes.find(n => n.id === edge.source)!, target = second.document.nodes.find(n => n.id === edge.target)!
      expect(source.parentId).toBe(target.parentId)
      expect([first.containerId, second.containerId]).toContain(source.parentId)
    }
    expect(exportSvg(second.document)).toContain('builtin-pipeline') // Component provenance is embedded with the document.
  })
  it('captures nested geometry and local style, excludes boundary-crossing edges, and records derivation', () => {
    const doc = createExample()
    groupObjects(doc, ['input', 'encoder'], 'branch')
    doc.containers.find(c => c.id === 'branch')!.appearance = { preset: 'dashed', accent: 'rose' }
    doc.containers.find(c => c.id === 'branch')!.role = 'boundary'
    const asset = captureComponent(doc, 'branch', '编码分支', '可复用结构', ['Encoder'])
    expect(asset.figure.nodes).toHaveLength(2); expect(asset.figure.edges.map(e => e.id)).toEqual(['e1'])
    expect(rootContainer(asset.figure)).toMatchObject({ x: 0, y: 0, id: 'stage', parentId: null })
    expect(asset.figure.style).toMatchObject({ preset: 'dashed', accent: 'rose' })
    expect(asset.figure.nodes[1]!.x - asset.figure.nodes[0]!.x).toBe(doc.nodes[1]!.x - doc.nodes[0]!.x)
    const inserted = instantiateComponent(createBlank(), asset, 'stage')
    expect(inserted.document.containers.find(c => c.id === inserted.containerId)?.role).toBe('boundary')
    const derived = captureComponent(inserted.document, inserted.containerId, '派生分支')
    expect(derived.lineage).toEqual([{ assetId: asset.id, name: asset.name, revision: asset.updatedAt }])
    const nested = captureComponent(inserted.document, 'stage', '嵌套整体')
    expect(nested.figure.containers).toHaveLength(2)
    const outer = componentDocument(nested)
    expect(() => parseDocument(outer)).not.toThrow()
  })
  it('retains source references and recipe parameters across insertion, capture, backup and inheritance', () => {
    const asset = buildRecipe('fusion', { branches: 2, operator: 'sum', feature: 'tensor' })
    asset.figure.style.preset = 'sketch'; asset.figure.style.accent = 'teal'
    const target = createBlank(), kept = instantiateComponent(target, asset, 'stage')
    expect(resolveStyle(kept.document, kept.containerId)).toMatchObject({ preset: 'sketch', accent: 'teal' })
    const inherited = instantiateComponent(target, asset, 'stage', false)
    expect(resolveStyle(inherited.document, inherited.containerId)).toEqual(target.style)
    const origin = kept.document.containers.find(c => c.id === kept.containerId)!.component!
    expect(origin.recipe?.parameters).toEqual({ branches: 2, operator: 'sum', feature: 'tensor' })
    const captured = captureComponent(kept.document, kept.containerId, '融合改版')
    expect(captured.sources).toEqual(asset.sources)
    expect(importComponentText(JSON.stringify(captured))).toEqual(captured)
    expect(captured.lineage[0]?.assetId).toBe(asset.id)
    expect(captured.lineage[0]?.recipe?.parameters).toEqual({ branches: 2, operator: 'sum', feature: 'tensor' })
  })
  it('refuses impossible placement and capacity limits without changing the document', () => {
    const small = createBlank(); rootContainer(small).width = 200; rootContainer(small).height = 120
    const before = clone(small)
    expect(() => instantiateComponent(small, pipeline(), 'stage')).toThrow('空位')
    expect(small).toEqual(before)
    const full = createBlank()
    full.nodes = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, parentId: 'stage', kind: 'module', label: 'Module', x: 60, y: 150, width: 80, height: 44 }))
    expect(() => instantiateComponent(full, pipeline(), 'stage')).toThrow('60 个科研节点')
    expect(full.nodes).toHaveLength(60)
  })
  it('rejects empty captures, malformed files, unnormalized roots and dangling native connections', () => {
    expect(() => captureComponent(createBlank(), 'stage', '空组件')).toThrow()
    expect(() => importComponentText('{"format":"unknown"}')).toThrow()
    expect(() => importComponentText(' '.repeat(2_000_001))).toThrow('2 MB')
    const unnormalized = pipeline(); rootContainer(unnormalized.figure).x = 20
    expect(() => parseAsset(unnormalized)).toThrow()
    const invalid = pipeline(); invalid.figure.edges[0]!.target = 'external'
    expect(() => parseAsset(invalid)).toThrow()
  })
  it('reuses a full-canvas component without an extra wrapper or an invalid root movement', () => {
    const asset = pipeline(), root = rootContainer(asset.figure)
    root.width = 1000; root.height = 620
    const doc = componentDocument(asset)
    expect(doc.containers).toHaveLength(1)
    expect(rootContainer(doc)).toMatchObject({ id: 'stage', x: 0, y: 0, width: 1000, height: 620 })
    const before = clone(doc)
    moveObjects(doc, ['stage'], 100, 100)
    expect(doc).toEqual(before)
    expect(() => parseDocument(doc)).not.toThrow()
    expect(exportSvg(doc)).not.toContain('font-size="22"') // No document heading over the full-canvas component.
  })
})

describe('personal component persistence and editor history', () => {
  it('persists independently of the project, imports copies safely, and supports removal recovery', () => {
    const library = createComponentLibrary(), asset = pipeline()
    library.save(asset)
    expect(createComponentLibrary().assets.value).toEqual([asset])
    const copy = library.importFile(JSON.stringify(asset))
    expect(copy.id).not.toBe(asset.id); expect(copy.lineage[0]?.assetId).toBe(asset.id)
    expect(copy.name).toBe(`${asset.name}（副本 2）`)
    expect(library.assets.value).toHaveLength(2)
    library.remove(copy.id); expect(library.assets.value).toHaveLength(1)
    library.restore(); expect(library.assets.value).toHaveLength(2)
    const previous = clone(library.assets.value)
    expect(() => library.importFile('{}')).toThrow()
    expect(library.assets.value).toEqual(previous)
  })
  it('preserves the previous library when browser storage is unavailable and leaves corrupt storage untouched on load', () => {
    const library = createComponentLibrary(); library.save(pipeline())
    const previous = clone(library.assets.value)
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: () => { throw new Error('quota') } })
    expect(() => library.importFile(JSON.stringify(pipeline()))).toThrow('保存失败')
    expect(library.assets.value).toEqual(previous)
    storage.set(LIBRARY_KEY, '{corrupt')
    const corrupt = createComponentLibrary()
    expect(corrupt.error.value).toContain('读取失败'); expect(storage.get(LIBRARY_KEY)).toBe('{corrupt')
  })
  it('treats new-canvas insertion as one undoable change and preserves personal assets and component provenance on reload', () => {
    const e = scope.run(createEditor)!, original = clone(e.figure.value), asset = pipeline()
    e.library.save(asset)
    expect(e.insertComponent(asset, true, true)).toBe(true)
    expect(e.past.value).toHaveLength(1)
    expect(e.figure.value.nodes.filter(n=>!n.titleBlock)).toHaveLength(2)
    e.undo(); expect(e.figure.value).toEqual(original)
    e.redo(); e.save()
    const reopened = scope.run(createEditor)!
    expect(reopened.library.assets.value).toEqual([asset])
    expect(reopened.figure.value).toEqual(e.figure.value)
    expect(reopened.figure.value.containers.find(c => c.component)?.component?.assetId).toBe(asset.id)
    reopened.newProject('blank'); expect(reopened.figure.value.nodes).toEqual([])
    expect(reopened.library.assets.value).toHaveLength(1)
  })
  it('inherits the selected local container theme when using a component to start a new figure', () => {
    const e = scope.run(createEditor)!
    e.newProject('blank'); e.insertComponent(pipeline())
    e.setAccent('rose'); e.setStyle('dashed')
    expect(e.figure.value.style.accent).toBe('blue')
    expect(e.insertComponent(pipeline(), false, true)).toBe(true)
    expect(e.figure.value.style).toMatchObject({ accent: 'rose', preset: 'dashed' })
    expect(rootContainer(e.figure.value).appearance).toBeUndefined()
  })
})
