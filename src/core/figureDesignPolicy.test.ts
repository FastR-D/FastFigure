import {describe,expect,it} from 'vitest'
import {figureDesignPolicy,figureDesignPrompt,figureDesignReviewGuide,defaultStyleGuide} from './figureDesignPolicy.ts'
import {harnessPrompt} from './harness.ts'
import {captureStyleAsset,styleAssetSchema} from './styleAsset.ts'
import {createBlank,clone} from './model.ts'
import {paperThemes} from './figureThemes.ts'
import {scientificFigureDesign} from '../data/scientificPresentation.ts'
import {imageDraftInputSchema} from './imageDraftContract.ts'
import {imageDraftPrompt} from '../../server/imageDrafts/prompt.ts'

describe('scientific expression defaults reach actual generation entry points',()=>{
  it('passes shared rules to ordinary drawing, saved-style drawing and planning without rewriting the selected style',()=>{
    const figure=createBlank(),styleReference=captureStyleAsset(figure)
    styleReference.guide='Use the author’s navy and orange role mapping.'
    const input={sessionId:crypto.randomUUID(),figure,selectedIds:[],catalogue:[],content:'解释已提供的训练与推理机制',styleReference},before=clone(input)
    const prompt=harnessPrompt(input),marker='以下是当前工程快照（最新状态优先于历史会话）：\n'
    const context=JSON.parse(prompt.split(marker)[1]!.split('\n')[0]!)
    for(const [key,rule]of Object.entries(figureDesignPolicy))expect(context.materials.figureDesign[key]).toContain(rule)
    expect(context.styleReference).toEqual(styleReference)
    const plan=harnessPrompt({...input,intent:'plan'})
    expect(plan).toContain(JSON.stringify(scientificFigureDesign));expect(plan).toContain(JSON.stringify(styleReference))
    for(const actual of [prompt,plan]){
      expect(actual).not.toContain('默认布局必须对齐、居中')
      expect(actual).not.toContain('分区内容包围框与分区内容区同心')
      expect(actual).toContain(figureDesignPolicy.scope)
    }
    // Existing snapshots and custom style notes keep their identity; the rules are generation context.
    expect(input).toEqual(before)
    expect(captureStyleAsset(figure).guide).toBe(defaultStyleGuide)
    for(const theme of paperThemes)expect(()=>styleAssetSchema.parse(theme)).not.toThrow()
  })

  it('sends the same expression constraints to full image drafts while keeping isolated illustrations label-free',()=>{
    const figure=createBlank(),{id,name,updatedAt,designSystem,paperTheme,preset,paletteId,fontFamily,guide}=captureStyleAsset(figure)
    const input=imageDraftInputSchema.parse({requestId:crypto.randomUUID(),title:'Supervised example',content:'Samples x → fθ → prediction; supplied labels define the loss.',visual:'Emphasize the declared update path.',aspect:'landscape',timeoutSeconds:60,style:{id,name,updatedAt,designSystem,paperTheme,preset,paletteId,fontFamily,guide},references:[]}),before=clone(input)
    const draft=imageDraftPrompt(input,[]),illustration=imageDraftPrompt({...input,outputKind:'illustration'},[])
    expect(draft).toContain(figureDesignPrompt)
    expect(illustration).not.toContain(figureDesignPrompt)
    expect(illustration).toContain('不添加文字、标签、箭头、图框')
    expect(input).toEqual(before)
  })

  it('routes design review to visible evidence and scoped suggestions rather than an AI-origin verdict',()=>{
    const figure=createBlank(),before=clone(figure),prompt=harnessPrompt({sessionId:crypto.randomUUID(),figure,selectedIds:[],catalogue:[],content:'检查模板感与阅读层次',intent:'design-review'})
    expect(prompt).toContain(figureDesignReviewGuide)
    expect(prompt).toContain(JSON.stringify(scientificFigureDesign))
    expect(prompt).toContain('不得返回 figure、score、patch 或自动通过结论')
    expect(figure).toEqual(before)
  })
})
