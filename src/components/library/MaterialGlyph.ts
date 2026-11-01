import { defineComponent, h } from 'vue'
import { iconById, type IconElement } from '../../data/materials'
export default defineComponent({
  props: { iconId: { type: String, required: true } },
  setup(props) {
    function render(item: IconElement): ReturnType<typeof h> { return h(item.tag, item.attrs, item.children?.map(render)) }
    return () => {
      const icon = iconById.get(props.iconId)
      return h('svg', { viewBox: `0 0 ${icon?.width ?? 24} ${icon?.height ?? 24}`, 'aria-hidden': true, class: 'material-glyph' }, icon?.elements.map(render))
    }
  },
})
