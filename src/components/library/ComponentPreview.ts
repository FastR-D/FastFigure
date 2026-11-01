import { defineComponent, h, type PropType } from 'vue'
import type { NodeKind } from '../../core/model'
import { structureElements, type SvgElement } from '../../core/svg'
import { structureParts } from '../../core/structureVisual'
import type { NodeStructure } from '../../core/structures'
import { createBlank } from '../../core/model'
import { figurePaint } from '../../core/paint'
import type { VNode } from 'vue'
export default defineComponent({
  props: { kind: { type: String as PropType<NodeKind>, required: true }, label: { type: String, default: '' }, radius: {type:Number,default:0}, structure:{type:Object as PropType<NodeStructure>,default:undefined} },
  setup(props) {
    return () => {
      const ink = '#5983ac'
      if(props.kind==='path')return h('svg',{viewBox:'0 0 96 64',class:'component-preview','aria-hidden':true},[h('path',{d:`M16 32H80${props.label==='箭头'?' M70 24L80 32L70 40':''}`,stroke:ink,'stroke-width':1.5,fill:'none','stroke-linecap':'round'})])
      if(props.structure) {
        const doc=createBlank(),node={id:'preview',parentId:'stage',kind:props.kind,label:props.label,x:0,y:0,width:184,height:164,structure:props.structure}
        const render=(item:SvgElement|string):VNode|string=>typeof item==='string'?item:h(item.tag,item.attrs,(item.children??[]).map(render))
        return h('svg',{viewBox:'0 0 96 64',class:'component-preview','aria-hidden':true},structureElements(structureParts(node,{x:6,y:5,width:84,height:54},figurePaint(doc.style))).map(render))
      }
      if (props.kind === 'rectangle' || props.kind === 'diamond' || props.kind === 'text') return h('svg',{viewBox:'0 0 96 64',class:'component-preview','aria-hidden':true},props.kind==='text'?[h('text',{x:48,y:40,'text-anchor':'middle','font-size':26,fill:ink},'T')]:props.kind==='diamond'?[h('path',{d:'M48 8 82 32 48 56 14 32Z',fill:'#edf4fc',stroke:ink})]:[h('rect',{x:17,y:15,width:62,height:36,rx:props.radius,fill:'#edf4fc',stroke:ink})])
      if (props.kind === 'neuron' || props.kind === 'operator' || props.kind === 'ellipse') return h('svg', { viewBox: '0 0 96 64', class: 'component-preview', 'aria-hidden': true }, [
        h('circle', { cx: 48, cy: 32, r: 20, fill: '#edf4fc', stroke: ink, 'stroke-width': 1.2 }),
        ...(props.kind === 'operator' ? [h('text', { x: 48, y: 39, 'text-anchor': 'middle', fill: ink, 'font-size': 23 }, props.label || '+')] : []),
      ])
      if (props.kind === 'volume') return h('svg', { viewBox: '0 0 96 64', class: 'component-preview', 'aria-hidden': true }, [
        h('path', { d: 'M20 22 34 10H78V42L64 54H20Z', fill: '#e1edfa', stroke: ink, 'stroke-width': 1.2 }),
        h('path', { d: 'M20 22H64V54M64 22 78 10', fill: 'none', stroke: ink, 'stroke-width': 1.2 }),
      ])
      if (props.kind === 'projection') return h('svg', { viewBox: '0 0 96 64', class: 'component-preview', 'aria-hidden': true }, [
        h('path', { d: 'M32 14H64L80 50H16Z', fill: '#edf4fc', stroke: ink, 'stroke-width': 1.2 }),
      ])
      const children = props.kind === 'tensor' ? [
        h('rect', { x: 27, y: 9, width: 57, height: 32, rx: 4, fill: '#e1edfa', stroke: '#a4bfde' }),
        h('rect', { x: 23, y: 13, width: 57, height: 32, rx: 4, fill: '#edf4fc', stroke: '#86a7cc' }),
      ] : []
      children.push(h('rect', { x: 19, y: 17, width: 57, height: 32, rx: 4, fill: '#fff', stroke: ink, 'stroke-width': 1.2 }))
      if (props.kind === 'tokens' || props.kind === 'queue') {
        for (let i = 0; i < 4; i++) children.push(h('rect', { x: 25 + i * 12, y: 25, width: 9, height: 14, rx: props.kind === 'tokens' ? 2 : 0, fill: '#edf4fc', stroke: ink, 'stroke-width': 0.7 }))
      } else children.push(h('path', { d: 'M33 28H61M33 36H53', stroke: ink, 'stroke-width': 1.2, 'stroke-linecap': 'round' }))
      return h('svg', { viewBox: '0 0 96 64', class: 'component-preview', 'aria-hidden': true }, children)
    }
  },
})
