import {parseAsset} from './assets'
import type {DrawioDocument} from './drawioDocument'

export const importLimits={files:50,fileBytes:2_000_000,totalBytes:50_000_000} as const
export interface ComponentImportFile {name:string;format:'json'|'svg'|'drawio';bytes:number;sha256:string;source:string;drawing?:DrawioDocument}
export async function readComponentImportFile(file:File):Promise<ComponentImportFile>{
  if(file.size>importLimits.fileBytes)throw new Error('单个文件不能超过 2 MB')
  let format:ComponentImportFile['format']|null=/\.(drawio|xml)$/i.test(file.name)?'drawio':/\.svg$/i.test(file.name)?'svg':/\.json$/i.test(file.name)?'json':null
  if(!format)throw new Error('请选择组件 JSON、SVG 或 draw.io 文件')
  if(!file.name.trim()||file.name.length>200)throw new Error('文件名须为 1 至 200 字')
  const bytes=await file.arrayBuffer(),raw=new Uint8Array(bytes),encoding=format!=='json'&&raw[0]===255&&raw[1]===254?'utf-16le':format!=='json'&&raw[0]===254&&raw[1]===255?'utf-16be':'utf-8'
  let source:string
  try{source=new TextDecoder(encoding,{fatal:true}).decode(bytes)}catch{throw new Error('文件文字编码无效，请转换为 UTF-8')}
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('')
  if(format==='svg'&&/\bcontent\s*=/.test(source)){
    const {drawioXml}=await import('./drawioDocument'),content=drawioXml(source).documentElement.getAttribute('content')??''
    if(/^\s*(?:<|%3[cC])(?:mxfile|mxGraphModel|diagram)\b/.test(content))format='drawio'
  }
  const drawing=format==='drawio'?await(await import('./drawioDocument')).inspectDrawio(source):undefined
  return{name:file.name,format,bytes:bytes.byteLength,sha256,source,...(drawing?{drawing}:{})}
}
export async function parseComponentImportFile(file:ComponentImportFile,pageKey?:string){
  if(file.format==='json'){
    let value:unknown
    try{value=JSON.parse(file.source)}catch{throw new Error('组件 JSON 格式无效')}
    try{return{asset:parseAsset(value),warnings:[] as string[],mode:'component' as const}}catch{throw new Error('请选择 fastfigure.component 组件文件；工程文件请先采集组件')}
  }
  if(file.format==='drawio'){
    const {inspectDrawio,prepareDrawio,importPreparedDrawio}=await import('./drawioImport'),document=file.drawing??await inspectDrawio(file.source)
    if(!pageKey&&document.pages.length>1)throw new Error('请明确选择 draw.io 页面')
    const key=pageKey??document.pages[0]!.key,first=prepareDrawio(document,key)
    await Promise.all(first.inventory.fonts.flatMap(font=>[400,700].map(weight=>globalThis.document.fonts.load(`${weight} 16px "${font}"`))))
    const result=importPreparedDrawio(prepareDrawio(document,key),{fileName:file.name,sha256:file.sha256,keepGroups:true})
    return{asset:result.asset,warnings:result.report.warnings,mode:'drawio' as const}
  }
  const {importSvg,inspectSvg}=await import('./svgImport')
  const inventory=inspectSvg(file.source)
  await Promise.all(inventory.fonts.flatMap(font=>[400,700].map(weight=>document.fonts.load(`${weight} 16px "${font}"`))))
  const result=importSvg(file.source,{fileName:file.name,sha256:file.sha256,keepGroups:true,preferMetadata:true})
  return{asset:result.asset,warnings:result.report.warnings,mode:result.report.mode}
}
