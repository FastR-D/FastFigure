import {paperIcons} from './paperIcons.ts'
import themePalettes from './materials/theme-palettes.json' with {type:'json'}
import paletteData from './materials/palettes.json' with { type: 'json' }
import iconData from './materials/icons.json' with { type: 'json' }
import figureforgePalettes from './materials/figureforge-palettes.json' with {type:'json'}

export interface ColorPalette { id: string; title: string; family: string; kind: string; colors: string[]; source: string; sourceUrl: string; license: string; tags: string[] }
export interface IconElement { tag: string; attrs: Record<string, string>; children?: IconElement[] }
export interface MaterialIcon { id: string; name: string; category: string; tags: string[]; width: number; height: number; elements: IconElement[] }
export const colorPalettes: ColorPalette[] = [...paletteData.entries,...figureforgePalettes,...themePalettes]
export const paletteById = new Map(colorPalettes.map(p => [p.id, p]))
export const defaultPaletteId = 'plotly-plotly-39871828'
export const materialIcons: MaterialIcon[] = [...paperIcons,...iconData]
export const iconById = new Map(materialIcons.map(i => [i.id, i]))
export const fontFamilies = ['Inter', 'MiSans', 'Noto Serif SC', 'JetBrains Mono', 'Comic Sans MS', 'Comic Neue', 'Patrick Hand', 'Excalifont'] as const
export const fontOptions = [{ value: 'Inter', label: 'Inter · 现代无衬线' }, { value: 'MiSans', label: 'MiSans · 小米黑体' }, { value: 'Noto Serif SC', label: '思源宋体 · 衬线' }, { value: 'JetBrains Mono', label: 'JetBrains Mono · 代码' },{value:'Comic Sans MS',label:'Comic Sans MS · 系统 / Comic Neue 回退'},{value:'Comic Neue',label:'Comic Neue · 漫画'},{value:'Patrick Hand',label:'Patrick Hand · 手稿'},{value:'Excalifont',label:'Excalifont · 白板'}]
export function fontStack(family = 'Inter') { if(family==='Comic Sans MS')return '"Comic Sans MS", "Comic Neue", "MiSans", cursive';if(['Comic Neue','Patrick Hand','Excalifont'].includes(family))return `"${family}", "MiSans", cursive`;return `${['serif','sans-serif','monospace','system-ui'].includes(family)?family:`"${family}"`}, "Inter", "MiSans", sans-serif` }
export function searchIcons(query: string, category = 'all') {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return materialIcons.filter(icon => (category === 'all' || icon.category === category) && terms.every(term => `${icon.id} ${icon.name} ${icon.tags.join(' ')}`.toLowerCase().includes(term)))
}
export function searchPalettes(query: string, source = 'all') {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return colorPalettes.filter(p => (source === 'all' || p.source === source) && terms.every(term => `${p.title} ${p.source} ${p.tags.join(' ')} ${p.colors.join(' ')}`.toLowerCase().includes(term)))
}
