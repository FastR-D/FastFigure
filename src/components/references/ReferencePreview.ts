import { defineComponent, h, onBeforeUnmount, ref, type PropType } from 'vue'
import { normalizedRegion } from '../../core/references'
import type { EvidenceRegion, ReferenceImage } from '../../core/model'

export default defineComponent({
  name: 'ReferencePreview',
  props: {
    image: { type: Object as PropType<ReferenceImage>, required: true },
    region: { type: Object as PropType<EvidenceRegion | null>, default: null },
    editable: { type: Boolean, default: false },
    label: { type: String, default: '' },
    viewport:{type:Object as PropType<EvidenceRegion|null>,default:null},
  },
  emits: { region: (_region: EvidenceRegion) => true },
  setup(props, { emit }) {
    const draft = ref<EvidenceRegion | null>(null)
    let cancel: (() => void) | undefined
    function start(event: PointerEvent) {
      if (!props.editable || event.button !== 0) return
      cancel?.(); event.preventDefault()
      const svg = event.currentTarget as SVGSVGElement
      const point = (e: PointerEvent) => {
        const matrix = svg.getScreenCTM()
        if (!matrix) return { x: 0, y: 0 }
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
        return { x: p.x / props.image.pixelWidth, y: p.y / props.image.pixelHeight }
      }
      const origin = point(event)
      const cleanup = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done)
        window.removeEventListener('pointercancel', abort); window.removeEventListener('keydown', key)
        draft.value = null; cancel = undefined
      }
      const move = (e: PointerEvent) => { if (e.pointerId === event.pointerId) draft.value = normalizedRegion(origin, point(e)) }
      const done = (e: PointerEvent) => {
        if (e.pointerId !== event.pointerId) return
        const region = normalizedRegion(origin, point(e))
        cleanup()
        if (region.width * props.image.pixelWidth >= 3 && region.height * props.image.pixelHeight >= 3) emit('region', region)
      }
      const abort = () => cleanup()
      const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); abort() } }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', done)
      window.addEventListener('pointercancel', abort); window.addEventListener('keydown', key)
      cancel = abort
    }
    onBeforeUnmount(() => cancel?.())
    return () => {
      const image = props.image, region = draft.value ?? props.region
      const view=props.viewport?{x:props.viewport.x*image.pixelWidth,y:props.viewport.y*image.pixelHeight,width:props.viewport.width*image.pixelWidth,height:props.viewport.height*image.pixelHeight}:{x:0,y:0,width:image.pixelWidth,height:image.pixelHeight}
      return h('svg', { viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`, role: 'img',
        'aria-label': props.label || (props.editable ? '框选参考图证据区域' : `参考图 ${image.title}`), class: 'reference-preview',
        style: { aspectRatio: `${view.width} / ${view.height}`, touchAction: props.editable ? 'none' : 'auto', cursor: props.editable ? 'crosshair' : 'default' },
        onPointerdown: start,
      }, [
        h('image', { href: image.dataUrl, width: image.pixelWidth, height: image.pixelHeight, 'pointer-events': 'none' }),
        ...(region ? [h('rect', { x: region.x * image.pixelWidth, y: region.y * image.pixelHeight, width: region.width * image.pixelWidth, height: region.height * image.pixelHeight,
          fill: '#2f8af5', 'fill-opacity': 0.1, stroke: '#2f8af5', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none', 'data-evidence-region': '' })] : []),
      ])
    }
  },
})
