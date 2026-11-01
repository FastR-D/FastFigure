import {createHash,randomUUID} from 'node:crypto'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {imageDraftInputSchema,imageDraftOriginSchema,type ImageDraftInput,type ImageDraftRun} from '../../src/core/imageDraftContract.ts'
import {rasterDimensions} from '../harness/raster.ts'
import {CodexImageDraftAdapter,type DraftImageAdapter} from './adapter.ts'
import {imageDraftPrompt} from './prompt.ts'
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex')
export class ImageDraftError extends Error{constructor(readonly status:number,message:string){super(message)}}
interface Run{info:ImageDraftRun;input:ImageDraftInput;fingerprint:string;controller:AbortController;adapter:DraftImageAdapter;done?:Promise<void>;image?:{bytes:Buffer;mime:string};cwd?:string}
export class ImageDraftService{
  private runs=new Map<string,Run>();private requests=new Map<string,{id:string;fingerprint:string}>()
  constructor(private factory:()=>DraftImageAdapter=()=>new CodexImageDraftAdapter({...(process.env.FASTFIGURE_CODEX_COMMAND?{command:process.env.FASTFIGURE_CODEX_COMMAND}:{})})){}
  async status(){const adapter=this.factory();try{return await adapter.status()}finally{adapter.dispose()}}
  list(){return [...this.runs.values()].map(r=>structuredClone(r.info)).reverse()}
  get(id:string){const run=this.runs.get(id);if(!run)throw new ImageDraftError(404,'草稿记录已过期或不存在');return run}
  start(raw:unknown){
    const parsed=imageDraftInputSchema.safeParse(raw);if(!parsed.success)throw new ImageDraftError(400,parsed.error.issues[0]?.message??'草稿参数无效')
    const input=parsed.data,fingerprint=sha(JSON.stringify({...input,requestId:undefined})),existing=this.requests.get(input.requestId)
    if(existing){if(existing.fingerprint!==fingerprint)throw new ImageDraftError(409,'相同提交标识不能更改内容');if(!this.runs.has(existing.id))throw new ImageDraftError(410,'这次提交记录已过期，请重新发起');return this.get(existing.id)}
    if([...this.runs.values()].some(run=>run.info.status==='running'))throw new ImageDraftError(409,'已有一张草稿正在生成，请完成或停止后继续')
    const referenceInputs=input.references.map((r,i)=>{const bytes=Buffer.from(r.dataUrl.split(',')[1]!,'base64'),dimensions=rasterDimensions(r.dataUrl);if(dimensions.width!==r.width||dimensions.height!==r.height)throw new ImageDraftError(400,'参考图像素尺寸不符');return{index:i+1,id:r.id,title:r.title,citation:r.citation,purpose:r.purpose,fileName:r.fileName,sha256:r.sha256,...(r.generated?{generated:r.generated}:{}),inputSha256:sha(bytes),...dimensions}})
    if(input.composition){const sources=input.composition.references.filter(r=>r.decision==='use').sort((a,b)=>a.index-b.index);if(sources.some((ref,i)=>ref.inputSha256&&ref.inputSha256!==referenceInputs[i]!.inputSha256))throw new ImageDraftError(400,'方案参考图实际字节已变化，请恢复规划时的图片后重试')}
    if(imageDraftPrompt(input,referenceInputs).length>23000)throw new ImageDraftError(400,'内容与绘图方案超过生成提示容量，请精简后重新规划；未截断内容或调用模型')
    const id=randomUUID(),info:ImageDraftRun={id,requestId:input.requestId,title:input.title,status:'running',createdAt:new Date().toISOString(),content:input.content,visual:input.visual,aspect:input.aspect,timeoutSeconds:input.timeoutSeconds,...(input.model?{model:input.model}:{}),style:input.style,...(input.composition?{composition:input.composition}:{}),referenceInputs,activities:['已固定内容规格、风格与参考图，准备生成一张草稿'],error:'',review:'pending',available:false}
    const run:Run={info,input,fingerprint,controller:new AbortController(),adapter:this.factory()};this.runs.set(id,run);this.requests.set(input.requestId,{id,fingerprint});run.done=this.execute(run);this.prune();return run
  }
  private async execute(run:Run){
    const timer=setTimeout(()=>run.controller.abort(new Error('图像生成已超过本轮时限')),run.input.timeoutSeconds*1000)
    const activity=(text:string)=>{if(run.info.activities.length<40)run.info.activities.push(text.slice(0,500))}
    try{
      const status=await run.adapter.status();if(status.state!=='ready')throw new Error(status.message)
      run.controller.signal.throwIfAborted();run.cwd=await mkdtemp(join(tmpdir(),'fastfigure-image-draft-'))
      const paths:string[]=[]
      for(const [i,ref] of run.input.references.entries()){const ext=ref.dataUrl.startsWith('data:image/png')?'png':ref.dataUrl.startsWith('data:image/jpeg')?'jpg':'webp',path=join(run.cwd,`reference-${i+1}.${ext}`);await writeFile(path,Buffer.from(ref.dataUrl.split(',')[1]!,'base64'),{mode:0o600});paths.push(path)}
      const prompt=imageDraftPrompt(run.input,run.info.referenceInputs,paths);if(prompt.length>24000)throw new Error('实际生成提示超过容量，请精简方案后重试');await writeFile(join(run.cwd,'prompt.txt'),prompt,{mode:0o600});activity(run.input.composition?'已编译方案分区、模块与连接约束，提交一张图像草稿':'已提交 Codex 平台图像生成；结果先保留待审')
      const result=await run.adapter.send({cwd:run.cwd,content:prompt,paths,signal:run.controller.signal,emit:activity,...(run.input.model?{model:run.input.model}:{})});run.controller.signal.throwIfAborted()
      const mime=result.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':result.bytes[0]===255&&result.bytes[1]===216?'image/jpeg':'image/webp',dimensions=rasterDimensions(`data:${mime};base64,${result.bytes.toString('base64')}`)
      if(result.bytes.length>12_000_000||dimensions.width<3||dimensions.height<3||dimensions.width>8192||dimensions.height>8192||dimensions.width*dimensions.height>24_000_000)throw new Error('生成图片超过当前图片容量或像素限制')
      const observedReferenceIndices:number[]=[]
      for(const observed of result.inputImages??[]){const index=paths.findIndex(path=>resolve(path)===resolve(observed.path));if(index<0||run.info.referenceInputs[index]!.inputSha256!==observed.sha256)throw new Error('图像模型读取了本轮清单之外的图片，或参考图指纹不符');if(!observedReferenceIndices.includes(index+1))observedReferenceIndices.push(index+1)}
      const finishedAt=new Date().toISOString(),origin=imageDraftOriginSchema.parse({version:1,runId:run.info.id,provider:'codex-imagegen',illustrative:true,title:run.input.title,content:run.input.content,visual:run.input.visual,aspect:run.input.aspect,...(run.input.model?{model:run.input.model}:{}),...(result.imageModel?{imageModel:result.imageModel}:{}),style:run.input.style,...(run.input.composition?{composition:run.input.composition}:{}),submittedPrompt:prompt,...(result.revisedPrompt?{revisedPrompt:result.revisedPrompt.slice(0,24000),revisedPromptTruncated:result.revisedPrompt.length>24000}:{}),createdAt:run.info.createdAt,finishedAt,sha256:sha(result.bytes),...dimensions,referenceInputs:run.info.referenceInputs,inputVerification:result.inputImages===undefined?'unreported':observedReferenceIndices.length===paths.length?'verified':'partial',observedReferenceIndices:observedReferenceIndices.sort(),cliVersion:status.version,timeoutSeconds:run.input.timeoutSeconds})
      run.image={bytes:result.bytes,mime};run.info.origin=origin;run.info.available=true;run.info.status='completed';activity('草稿已生成，请核对后导入为参考图并重绘')
    }catch(e){const reason=run.controller.signal.aborted?run.controller.signal.reason:e;run.info.status=run.controller.signal.aborted?'cancelled':'failed';run.info.error=(reason instanceof Error?reason.message:'图像生成失败').slice(0,1000)}
    finally{clearTimeout(timer);run.adapter.dispose();run.info.finishedAt=new Date().toISOString();run.input.references=[];if(run.cwd)await rm(run.cwd,{recursive:true,force:true});this.prune()}
  }
  cancel(id:string){const run=this.get(id);if(run.info.status==='running')run.controller.abort(new DOMException('已停止生成草稿','AbortError'));return run.info}
  review(id:string,decision:'imported'|'discarded'){const run=this.get(id);if(run.info.status!=='completed'||!run.image)throw new ImageDraftError(409,'草稿图片当前不可用');if(run.info.review!=='pending'&&run.info.review!==decision)throw new ImageDraftError(409,'草稿已经处理，请保留历史记录');run.info.review=decision;return run.info}
  image(id:string){const run=this.get(id);if(!run.image)throw new ImageDraftError(410,'草稿图片已过期，请重新导入已下载的原文件');return run.image}
  private prune(){let count=0,bytes=0;for(const run of [...this.runs.values()].reverse()){if(run.image){count++;bytes+=run.image.bytes.length;if(count>12||bytes>96_000_000){run.image=undefined;run.info.available=false}}}for(const [id,run]of this.runs)if(this.runs.size>20&&run.info.status!=='running')this.runs.delete(id);while(this.requests.size>200)this.requests.delete(this.requests.keys().next().value!)}
  async dispose(){for(const run of this.runs.values())if(run.info.status==='running')run.controller.abort(new DOMException('本地服务已关闭','AbortError'));await Promise.allSettled([...this.runs.values()].map(run=>run.done));for(const run of this.runs.values())run.adapter.dispose();this.runs.clear()}
}
