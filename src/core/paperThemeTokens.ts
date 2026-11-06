import {z} from 'zod'

/** Drawing units on the 1000 × 620 editor; metricScale scales these defaults. */
export const paperThemeTokensSchema=z.object({
  variant:z.enum(['soft','warm','handdrawn']),
  radius:z.number().min(2).max(24),padding:z.number().min(4).max(20),strokeWidth:z.number().min(.5).max(3),
  containerRadius:z.number().min(2).max(28),containerHeadingSize:z.number().min(16).max(26),
  headingSize:z.number().min(14).max(26),bodySize:z.number().min(12).max(22),captionSize:z.number().min(10).max(18),
  titleFill:z.string().regex(/^#[0-9a-fA-F]{6}$/),ink:z.string().regex(/^#[0-9a-fA-F]{6}$/),outline:z.enum(['precise','gentle']),titleStyle:z.enum(['inline','tab']),
}).strict().refine(t=>t.headingSize>=t.bodySize&&t.bodySize>=t.captionSize,'字号须满足标题 ≥ 正文 ≥ 注释')
export type PaperThemeTokens=z.infer<typeof paperThemeTokensSchema>
export const paperThemeDefaults:Record<PaperThemeTokens['variant'],PaperThemeTokens>={
  soft:{variant:'soft',radius:10,padding:10,strokeWidth:1.2,containerRadius:14,containerHeadingSize:20,headingSize:18,bodySize:16,captionSize:12,titleFill:'#e7efd9',ink:'#282b29',outline:'precise',titleStyle:'inline'},
  warm:{variant:'warm',radius:14,padding:12,strokeWidth:1,containerRadius:18,containerHeadingSize:20,headingSize:18,bodySize:16,captionSize:12,titleFill:'#edb28f',ink:'#44372f',outline:'precise',titleStyle:'tab'},
  handdrawn:{variant:'handdrawn',radius:10,padding:10,strokeWidth:1.4,containerRadius:14,containerHeadingSize:21,headingSize:19,bodySize:17,captionSize:13,titleFill:'#e6efd9',ink:'#282b29',outline:'gentle',titleStyle:'inline'},
}
