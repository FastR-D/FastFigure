import {ref} from 'vue'
import {z} from 'zod'
import {styleAssetSchema,type StyleAsset} from '../core/styleAssetContract'
export const STYLE_LIBRARY_KEY='fastfigure.styles.v1'
const schema=z.object({version:z.literal(1),assets:z.array(styleAssetSchema).max(50)}).strict().superRefine((v,ctx)=>{if(new Set(v.assets.map(a=>a.id)).size!==v.assets.length)ctx.addIssue({code:'custom',message:'风格素材 ID 重复'})})
export function createStyleLibrary(){
  const assets=ref<StyleAsset[]>([]),error=ref(''),deleted=ref<StyleAsset|null>(null)
  try{const text=localStorage.getItem(STYLE_LIBRARY_KEY);if(text){if(text.length>600_000)throw new Error('风格库过大');assets.value=schema.parse(JSON.parse(text)).assets}}catch{error.value='本地风格库读取失败，原存储尚未覆盖；仍可导入备份。'}
  function persist(next:StyleAsset[]){const parsed=schema.parse({version:1,assets:next}),text=JSON.stringify(parsed);if(text.length>600_000)throw new Error('风格库已满，请备份并移除部分素材');try{localStorage.setItem(STYLE_LIBRARY_KEY,text)}catch{throw new Error('风格保存失败，请检查浏览器存储或下载备份')}assets.value=parsed.assets;error.value=''}
  function save(input:StyleAsset){const asset=styleAssetSchema.parse(input);persist([...assets.value.filter(a=>a.id!==asset.id),asset]);return asset}
  function importFile(text:string){if(text.length>60_000)throw new Error('风格文件最多 60 KB');const asset=styleAssetSchema.parse(JSON.parse(text));if(assets.value.some(a=>a.id===asset.id)){asset.id=`style-${crypto.randomUUID()}`;const base=asset.name.slice(0,86);let i=2;while(assets.value.some(a=>a.name===`${base}（副本 ${i}）`))i++;asset.name=`${base}（副本 ${i}）`;asset.createdAt=asset.updatedAt=new Date().toISOString()}return save(asset)}
  function remove(id:string){const asset=assets.value.find(a=>a.id===id);if(!asset)return;persist(assets.value.filter(a=>a.id!==id));deleted.value=structuredClone(JSON.parse(JSON.stringify(asset))) as StyleAsset}
  function restore(){if(deleted.value){save(deleted.value);deleted.value=null}}
  return{assets,error,deleted,save,importFile,remove,restore}
}
