import {z} from 'zod'
const sha=z.string().regex(/^[a-f0-9]{64}$/)
export const cataloguePreviewInfoSchema=z.object({version:z.literal(1),renderer:z.literal('fastfigure-browser-v1'),snapshotSha256:sha,sha256:sha,width:z.number().int().min(3).max(2000),height:z.number().int().min(3).max(2000),fonts:z.array(z.string().max(300)).max(600),tiles:z.array(z.object({index:z.number().int().min(1).max(6),key:z.string().min(1).max(100),name:z.string().min(1).max(100),assetId:z.string().min(1).max(80),revision:z.iso.datetime(),x:z.number().int().min(0),y:z.number().int().min(0),width:z.literal(800),height:z.literal(480)}).strict()).min(1).max(6)}).strict()
export type CataloguePreviewInfo=z.infer<typeof cataloguePreviewInfoSchema>
export const cataloguePreviewSchema=cataloguePreviewInfoSchema.extend({dataUrl:z.string().max(600_000).regex(/^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)}).strict()
export type CataloguePreview=z.infer<typeof cataloguePreviewSchema>
export function cataloguePreviewInfo(value:CataloguePreview){const{dataUrl,...info}=value;void dataUrl;return cataloguePreviewInfoSchema.parse(info)}
