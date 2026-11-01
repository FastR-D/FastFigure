import {z} from 'zod'
export const publicationSettingsSchema=z.object({version:z.literal(1),widthMm:z.number().finite().min(20).max(420),minFontPt:z.number().finite().min(1).max(24),minStrokePt:z.number().finite().min(.05).max(3),showTitle:z.boolean()}).strict()
export type PublicationSettings=z.infer<typeof publicationSettingsSchema>
export const defaultPublicationSettings:PublicationSettings={version:1,widthMm:88.9,minFontPt:9,minStrokePt:.25,showTitle:false}
export const publicationSizeReferences=[{name:'IEEE 单栏参考 · 88.9 mm',widthMm:88.9},{name:'IEEE 双栏参考 · 182 mm',widthMm:182}]
export const publicationSizeSource='https://journals.ieeeauthorcenter.ieee.org/create-your-ieee-journal-article/create-graphics-for-your-article/resolution-and-size/'
export const publicationTypeSource='https://conferences.ieeeauthorcenter.ieee.org/write-your-paper/improve-your-graphics/'
export interface PublicationMeasure {objectId:string;kind:'node'|'container'|'edge'|'document';label:string;field:string;sample:string;minPt:number;maxPt:number;parts:number;transformed:boolean}
export interface PublicationReport {version:1;engine:'native-svg-physical-v1';widthMm:number;heightMm:number;pointsPerUnit:number;textFields:number;strokeObjects:number;minFontPt:number|null;minStrokePt:number|null;smallText:number;thinStroke:number;total:number;omitted:number;issues:(PublicationMeasure&{reason:'text'|'stroke'})[]}
