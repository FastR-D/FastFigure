export interface DrawioPage {key:string;id:string;name:string;model:Element}
export interface DrawioDocument {pages:DrawioPage[]}
export interface DrawioXmlOptions {parseXml?:(source:string)=>Document;parseHtml?:(source:string)=>Document;serializeXml?:(element:Element)=>string}
export const xmlChildren=(element:Element)=>Array.from(element.childNodes).filter((node):node is Element=>node.nodeType===1)
export function drawioXml(source:string,options:DrawioXmlOptions={},limit=8_000_000){
  if(new TextEncoder().encode(source).length>limit)throw new Error('draw.io 解码内容不能超过 8 MB')
  if(/<!DOCTYPE|<!ENTITY/i.test(source)||source.includes('\0'))throw new Error('draw.io 含有不支持的文档声明或无效字符')
  const document=options.parseXml?options.parseXml(source):new DOMParser().parseFromString(source,'application/xml')
  if(!document.documentElement||document.getElementsByTagName('parsererror').length)throw new Error('draw.io XML 格式无效')
  if(document.getElementsByTagName('*').length>8192)throw new Error('draw.io XML 元素过多，请拆分文件')
  return document
}
async function inflatePage(text:string){
  if(!/^[A-Za-z0-9+/=\s]+$/.test(text))throw new Error('draw.io 压缩页面不是有效 Base64')
  let bytes:Uint8Array
  try{bytes=Uint8Array.from(atob(text.replace(/\s/g,'')),char=>char.charCodeAt(0))}catch{throw new Error('draw.io 压缩页面编码无效')}
  const reader=new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks:Uint8Array[]=[]
  let size=0
  try{for(;;){const row=await reader.read();if(row.done)break;size+=row.value.byteLength;if(size>8_000_000){await reader.cancel();throw new Error('draw.io 解压内容超过 8 MB，请拆分文件')}chunks.push(row.value)}}catch(error){if(error instanceof Error&&error.message.includes('8 MB'))throw error;throw new Error('draw.io 压缩页面无法解码',{cause:error})}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}
  try{return decodeURIComponent(new TextDecoder('utf-8',{fatal:true}).decode(result))}catch{throw new Error('draw.io 解压页面的文字编码无效')}
}
/** Page decoding uses raw DEFLATE, as specified by Graph.compress/decompress. */
export async function inspectDrawio(source:string,options:DrawioXmlOptions={}):Promise<DrawioDocument>{
  if(new TextEncoder().encode(source).length>2_000_000)throw new Error('draw.io 原文件不能超过 2 MB')
  let root=drawioXml(source,options).documentElement
  if(root.localName==='svg'){
    const content=root.getAttribute('content');if(!content)throw new Error('SVG 没有嵌入 draw.io 源文件')
    let xml=content;if(!xml.trimStart().startsWith('<')){try{xml=decodeURIComponent(xml)}catch{throw new Error('draw.io SVG 源数据编码无效')}}
    root=drawioXml(xml,options).documentElement
  }
  const pages:DrawioPage[]=[],ids=new Set<string>();let decoded=0
  const add=(model:Element,id:string,name:string)=>{
    if(model.localName!=='mxGraphModel'||xmlChildren(model).filter(element=>element.localName==='root').length!==1)throw new Error('draw.io 页面须包含一个 mxGraphModel/root')
    if(id.length>200||ids.has(id))throw new Error('draw.io 页面 ID 重复或过长');ids.add(id)
    pages.push({key:`page-${pages.length}`,id,name:name.slice(0,100)||`第 ${pages.length+1} 页`,model})
  }
  if(root.localName==='mxGraphModel')add(root,'page-0','图件')
  else{
    const diagrams=root.localName==='diagram'?[root]:root.localName==='mxfile'?xmlChildren(root).filter(element=>element.localName==='diagram'):[]
    if(!diagrams.length||diagrams.length>50)throw new Error('请选择包含 1–50 页的 draw.io 文件')
    for(const [index,diagram]of diagrams.entries()){
      const models=xmlChildren(diagram);if(models.length>1||models.some(model=>model.localName!=='mxGraphModel'))throw new Error('draw.io 页面结构无效')
      let model=models[0]
      if(!model){const xml=await inflatePage(diagram.textContent?.trim()??'');decoded+=new TextEncoder().encode(xml).length;if(decoded>8_000_000)throw new Error('draw.io 全部解码页面超过 8 MB');model=drawioXml(xml,options).documentElement}
      add(model,diagram.getAttribute('id')||`page-${index}`,diagram.getAttribute('name')||`第 ${index+1} 页`)
    }
  }
  return{pages}
}
