import {z} from 'zod'
import {fontFamilies} from '../data/materials.ts'

export const fontFamilySchema=z.enum(fontFamilies)
export const importedFontName=z.string().max(80).regex(/^[\p{L}\p{N} _.-]+$/u)
