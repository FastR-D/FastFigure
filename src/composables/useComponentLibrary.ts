import { ref } from 'vue'
import { z } from 'zod'
import { clone, rootContainer } from '../core/model'
import { componentAssetSchema, importComponentText, parseAsset, type ComponentAsset } from '../core/assets'

export const LIBRARY_KEY = 'fastfigure.components.v1'
const librarySchema = z.object({ version: z.literal(1), assets: z.array(componentAssetSchema).max(50) }).superRefine((value, ctx) => {
  if (new Set(value.assets.map(a => a.id)).size !== value.assets.length) ctx.addIssue({ code: 'custom', message: '组件 ID 重复' })
})
export function createComponentLibrary() {
  const assets = ref<ComponentAsset[]>([]), error = ref(''), deleted = ref<ComponentAsset | null>(null)
  try {
    const stored = localStorage.getItem(LIBRARY_KEY)
    if (stored) {
      if (stored.length > 4_000_000) throw new Error('组件库过大')
      assets.value = librarySchema.parse(JSON.parse(stored)).assets
    }
  } catch { error.value = '本地组件库读取失败，原存储尚未覆盖；仍可导入组件文件。' }
  function persist(next: ComponentAsset[]) {
    const library = librarySchema.parse({ version: 1, assets: next }), text = JSON.stringify(library)
    if (text.length > 4_000_000) throw new Error('本地组件库已满，请先导出并移除部分组件')
    try { localStorage.setItem(LIBRARY_KEY, text) }
    catch { throw new Error('组件保存失败，浏览器存储空间不足或不可用。请导出组件文件。') }
    assets.value = library.assets; error.value = ''
  }
  function save(input: ComponentAsset) {
    const asset = parseAsset(input)
    if (!assets.value.some(a => a.id === asset.id) && assets.value.length >= 50) throw new Error('当前浏览器最多保存 50 个组件')
    persist([...assets.value.filter(a => a.id !== asset.id), asset])
    return asset
  }
  function importFile(text: string) {
    const asset = clone(importComponentText(text))
    // Duplicate imports are copies; never silently overwrite a locally edited asset.
    if (assets.value.some(a => a.id === asset.id)) {
      if (asset.lineage.length >= 16) throw new Error('组件来源链已满，无法创建导入副本')
      asset.lineage.push({ assetId: asset.id, name: asset.name, revision: asset.updatedAt, ...(asset.recipe ? { recipe: clone(asset.recipe) } : {}) })
      asset.id = `asset-${crypto.randomUUID()}`
      asset.createdAt = asset.updatedAt = new Date().toISOString()
      const base = asset.name.slice(0, 88)
      let index = 2
      while (assets.value.some(a => a.name === `${base}（副本 ${index}）`)) index++
      asset.name = `${base}（副本 ${index}）`
      asset.figure.title = asset.name; rootContainer(asset.figure).title = asset.name
    }
    return save(asset)
  }
  function remove(id: string) {
    const asset = assets.value.find(a => a.id === id)
    if (!asset) return
    persist(assets.value.filter(a => a.id !== id)); deleted.value = clone(asset)
  }
  function restore() { if (deleted.value) { save(deleted.value); deleted.value = null } }
  return { assets, error, deleted, save, importFile, remove, restore }
}
