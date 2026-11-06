import { defineComponent, h, type PropType } from 'vue'
import rough from 'roughjs'
import type { StyleId } from '../../core/model'
import {createBlank} from '../../core/model'
import {createScene,type SvgElement} from '../../core/svg'
import type {StyleAsset} from '../../core/styleAssetContract'
const render=(item:SvgElement|string):ReturnType<typeof h>|string=>typeof item==='string'?item:h(item.tag,item.attrs,(item.children??[]).map(render))
const gen = rough.generator()
export default defineComponent({
  props: { preset: { type: String as PropType<StyleId>, default:'soft' },theme:{type:Object as PropType<StyleAsset>,default:undefined} },
  setup(props) {
    return () => {
      if(props.theme){
        const theme=props.theme,doc=createBlank();doc.style={...doc.style,designSystem:theme.designSystem??'legacy',paperTheme:theme.paperTheme,fontRoles:theme.fontRoles,preset:theme.preset,sketchStyle:theme.sketchStyle,roughness:theme.roughness??1,paletteId:theme.paletteId,fontFamily:theme.fontFamily}
        if(theme.designSystem==='paper'){
          Object.assign(doc.containers[0]!,{role:'component',x:2,y:2,width:260,height:140,visual:{fill:'none',stroke:'none'}})
          doc.containers.push({id:'scope',parentId:'stage',role:'panel',title:'机制 · Planning',x:8,y:70,width:248,height:66,visual:{role:'planning'}})
          doc.nodes=[{id:'sense',parentId:'stage',kind:'rectangle',textRole:'heading',label:'感知',x:8,y:10,width:72,height:46,visual:{role:'perception'}},{id:'plan',parentId:'stage',kind:'rectangle',textRole:'heading',label:'规划',x:96,y:10,width:72,height:46,visual:{role:'planning'}},{id:'act',parentId:'stage',kind:'rectangle',textRole:'heading',label:'执行',x:184,y:10,width:72,height:46,visual:{role:'execution'}}]
          doc.edges=[{id:'sense-plan',source:'sense',target:'plan',sourcePort:'right',targetPort:'left',routing:'straight'},{id:'plan-act',source:'plan',target:'act',sourcePort:'right',targetPort:'left',routing:'straight'}]
          return h('svg',{viewBox:'0 0 264 144','aria-hidden':true,class:'style-preview theme-preview paper-theme-preview'},createScene(doc,false).map(render))
        }
        Object.assign(doc.containers[0]!,{role:'component',x:7,y:6,width:118,height:64,visual:{tone:theme.surface==='hatch'?'hatch':'fill'}})
        doc.nodes=[{id:'preview-box',parentId:'stage',kind:'rectangle',label:'Abc',x:18,y:21,width:43,height:32,textStyle:{size:16},visual:{padding:3}},{id:'preview-circle',parentId:'stage',kind:'ellipse',label:'x',x:85,y:23,width:30,height:30,textStyle:{size:16},visual:{colorIndex:1,padding:3}}]
        doc.edges=[{id:'preview-link',source:'preview-box',target:'preview-circle',sourcePort:'right',targetPort:'left'}]
        return h('svg',{viewBox:'0 0 132 78','aria-hidden':true,class:'style-preview theme-preview'},createScene(doc,false).map(render))
      }
      const p = props.preset, ink = '#56799c'
      const border = p === 'sketch' ? gen.toPaths(gen.rectangle(12, 8, 88, 48, {
        seed: 38191, roughness: 1, stroke: ink, strokeWidth: 1.2,
        fill: '#ffffff', fillStyle: 'solid',
      })).map(path => h('path', { d: path.d, stroke: path.stroke, fill: path.fill, 'stroke-width': path.strokeWidth }))
        : p === 'bracket' ? [h('path', { d: 'M21 8H12V56H21 M91 8H100V56H91', fill: 'none', stroke: ink })]
          : [h('rect', { x: 12, y: 8, width: 88, height: 48, rx: p === 'soft' || p === 'header' ? 6 : 2,
            fill: p === 'soft' ? '#e8f2fc' : '#fff', stroke: ink, 'stroke-dasharray': p === 'dashed' ? '4 3' : undefined })]
      return h('svg', { viewBox: '0 0 112 64', 'aria-hidden': true, class: 'style-preview' }, [
        ...border,
        ...(p === 'header' ? [h('path', { d: 'M13 23H99M18 14H42', stroke: ink, 'stroke-width': 1 })] : []),
        h('path', { d: 'M42 39H70', stroke: ink, 'stroke-width': 1 }),
        h('rect', { x: 23, y: 29, width: 22, height: 18, rx: 3, fill: '#fff', stroke: ink }),
        h('rect', { x: 67, y: 29, width: 22, height: 18, rx: 3, fill: '#fff', stroke: ink }),
      ])
    }
  },
})
