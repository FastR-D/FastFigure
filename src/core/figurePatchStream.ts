import {z} from 'zod'
import {clone,type FigureDocument} from './model.ts'
import type {StyleAsset} from './styleAsset.ts'
import {applyFigurePatch,figurePatchKey,figurePatchOperationSchema,type FigurePatchOperation} from './figurePatch.ts'
import {referenceNotesSchema} from './referenceInputs.ts'

const startSchema=z.object({type:z.literal('start'),protocol:z.literal('fastfigure.patch.v1'),base:z.string().regex(/^[a-f0-9]{16}$/)}).strict()
const batchSchema=z.object({type:z.literal('patch'),seq:z.number().int().positive(),operations:z.array(figurePatchOperationSchema).min(1).max(120)}).strict()
const completeSchema=z.object({type:z.literal('complete'),seq:z.number().int().positive(),message:z.string().min(1).max(5000),referenceNotes:referenceNotesSchema.optional()}).strict()

/** Newlines delimit transactions, not transport chunks. An incomplete line never changes a preview. */
export class FigurePatchStream{
  active=false
  legacy=false
  revision=0
  preview:FigureDocument
  private buffer=''
  private bytes=0
  private operations:FigurePatchOperation[]=[]
  private complete:z.infer<typeof completeSchema>|undefined
  private readonly base:string
  constructor(original:FigureDocument,private readonly preferredStyle?:StyleAsset){this.preview=clone(original);this.base=figurePatchKey(original)}
  push(chunk:string):boolean{
    if(this.legacy)return false
    this.bytes+=chunk.length;if(this.bytes>300_000)throw new Error('流式补丁超过输出限制')
    this.buffer+=chunk;const before=this.revision
    let newline:number
    while((newline=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,newline).trim();this.buffer=this.buffer.slice(newline+1);if(line)this.line(line);if(this.legacy){this.buffer='';break}}
    return this.revision>before
  }
  private line(line:string){
    if(!this.active){
      let value:unknown
      try{value=JSON.parse(line)}catch{this.legacy=true;return}
      if(!value||typeof value!=='object'||!('type'in value)||value.type!=='start'){this.legacy=true;return}
      const start=startSchema.parse(value);if(start.base!==this.base)throw new Error('流式补丁基准已变化')
      this.active=true;return
    }
    if(this.complete)throw new Error('完成标记之后不能继续提交补丁')
    const value:unknown=JSON.parse(line)
    if(value&&typeof value==='object'&&'type'in value&&value.type==='complete'){
      const complete=completeSchema.parse(value);if(complete.seq!==this.revision+1)throw new Error('流式补丁序号不连续')
      this.complete=complete;return
    }
    const batch=batchSchema.parse(value)
    if(batch.seq!==this.revision+1)throw new Error('流式补丁序号不连续或重复')
    if(this.operations.length+batch.operations.length>600)throw new Error('流式补丁最多 600 项操作')
    const candidate=applyFigurePatch(this.preview,{base:figurePatchKey(this.preview),operations:batch.operations},this.revision===0?this.preferredStyle:undefined)
    this.preview=candidate;this.operations.push(...batch.operations);this.revision=batch.seq
  }
  finish(){
    if(!this.legacy&&this.buffer.trim())this.line(this.buffer.trim())
    this.buffer=''
    if(!this.active)return undefined
    if(!this.complete)throw new Error('流式绘图尚未收到 complete，未生成可应用候选')
    return{message:this.complete.message,patch:{base:this.base,operations:this.operations},...(this.complete.referenceNotes?{referenceNotes:this.complete.referenceNotes}:{})}
  }
}

export function decodeFigurePatchStream(text:string,original:FigureDocument,preferredStyle?:StyleAsset){
  const stream=new FigurePatchStream(original,preferredStyle);stream.push(text)
  const response=stream.finish()
  return response?{response,figure:stream.preview}:undefined
}
