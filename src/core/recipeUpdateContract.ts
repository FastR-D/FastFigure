import {z} from 'zod'
const id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
const value=z.union([z.string().max(100),z.number().finite()])
const parameters=z.record(z.string().min(1).max(40),value).refine(record=>Object.keys(record).length<=20,'组合参数最多 20 项')
export const recipeUpdateRequestSchema=z.object({containerId:id,parameters,layout:z.enum(['scale','frame']),keepEdits:z.boolean().default(true),reason:z.string().trim().min(1).max(600)}).strict()
export const recipeUpdateRequestsSchema=z.array(recipeUpdateRequestSchema).max(12).refine(rows=>new Set(rows.map(row=>row.containerId)).size===rows.length,'同一组合每轮只能更新一次')
const count=z.number().int().min(0).max(5000)
export const recipeUpdateUseSchema=z.object({containerId:id,title:z.string().min(1).max(100),recipeId:id,recipeName:z.string().min(1).max(100),before:parameters,after:parameters,layout:z.enum(['scale','frame']),keepEdits:z.boolean(),reason:z.string().trim().min(1).max(600),changed:z.boolean(),beforeRevision:z.number().int().nonnegative(),afterRevision:z.number().int().nonnegative(),beforeScale:z.number().positive().max(16),afterScale:z.number().positive().max(16),generated:count,added:count,removed:count,preserved:count,overrides:count,retainedIds:count,fields:z.array(z.object({key:z.string().max(40),label:z.string().max(100),before:value,after:value,beforeLabel:z.string().max(100),afterLabel:z.string().max(100)}).strict()).max(20)}).strict()
export type RecipeUpdateRequest=z.infer<typeof recipeUpdateRequestSchema>
export type RecipeUpdateUse=z.infer<typeof recipeUpdateUseSchema>
