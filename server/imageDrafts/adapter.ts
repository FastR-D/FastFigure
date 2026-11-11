import {readFile,stat} from 'node:fs/promises'
import {isAbsolute} from 'node:path'
import {JsonlRpc,record} from '../harness/rpc.ts'
import {CodexAdapter,type AdapterOptions} from '../harness/adapters.ts'
export interface DraftImageResult{bytes:Buffer;revisedPrompt?:string;inputImages?:{path:string;sha256:string}[];imageModel?:string}
export interface DraftImageTurn{cwd:string;content:string;model?:string;paths:string[];signal:AbortSignal;emit:(message:string)=>void}
export interface DraftImageAdapter{status:()=>ReturnType<CodexAdapter['status']>;send:(input:DraftImageTurn)=>Promise<DraftImageResult>;dispose:()=>Promise<void>}
export class CodexImageDraftAdapter implements DraftImageAdapter{
  private rpc?:JsonlRpc
  constructor(private options:AdapterOptions={}){}
  status(){return new CodexAdapter(this.options).status()}
  async dispose(){const rpc=this.rpc;if(rpc){await rpc.dispose();if(this.rpc===rpc)this.rpc=undefined}}
  async send(input:DraftImageTurn):Promise<DraftImageResult>{
    input.signal.throwIfAborted()
    const rpc=new JsonlRpc(this.options.command??'codex',[...(this.options.args??[]),'app-server','--stdio','--enable','image_generation','-c','features.shell_tool=false','-c','features.unified_exec=false','-c','features.multi_agent=false','-c','features.apps=false','-c','features.plugins=false','-c','features.hooks=false','-c','web_search="disabled"','-c','mcp_servers={}'],input.cwd,this.options.env,24_000_000);this.rpc=rpc
    try{
    const abortInit=()=>{void this.dispose().catch(()=>undefined)};input.signal.addEventListener('abort',abortInit,{once:true})
    let threadId=''
    try{await rpc.request('initialize',{clientInfo:{name:'fastfigure-image-drafts',version:'0.2.0'}});rpc.notify('initialized');const started=record(await rpc.request('thread/start',{cwd:input.cwd,approvalPolicy:'never',sandbox:'workspace-write',ephemeral:true}));threadId=String(record(started.thread).id??'');if(!threadId)throw new Error('Codex 未返回图像会话 ID')}finally{input.signal.removeEventListener('abort',abortInit)}
    input.signal.throwIfAborted()
    return await new Promise<DraftImageResult>((resolve,reject)=>{
      let turnId='',settled=false,reading=false,imageCalls=0,lastText='';const early:{method?:string;params?:unknown}[]=[]
      const cleanup=()=>{rpc.listeners.delete(handle);rpc.exits.delete(fail);input.signal.removeEventListener('abort',abort)}
      const fail=(error:Error)=>{if(settled)return;settled=true;cleanup();reject(error)}
      const abort=()=>fail(new DOMException('图像生成已取消','AbortError'))
      const image=async(item:Record<string,unknown>)=>{
        if(reading||settled)return;reading=true
        try{
          if(item.failure)throw new Error('平台图像生成额度不可用，请稍后重试')
          if(item.status!=='completed')throw new Error('平台未成功完成图像生成')
          let bytes:Buffer
          if(typeof item.result==='string'&&/^(?:data:image\/(?:png|jpeg|webp);base64,)?[A-Za-z0-9+/]+={0,2}$/.test(item.result)&&item.result.length>32)bytes=Buffer.from(item.result.replace(/^data:image\/[^;]+;base64,/,''),'base64')
          else if(typeof item.savedPath==='string'&&isAbsolute(item.savedPath)){const info=await stat(item.savedPath);if(!info.isFile()||info.size>12_000_000)throw new Error('生成图片超过 12 MB 或文件无效');bytes=await readFile(item.savedPath)}
          else throw new Error('CLI 没有提供可读取的生成图片；请更新 CLI 或手动导入草稿')
          input.signal.throwIfAborted();if(bytes.length>12_000_000)throw new Error('生成图片超过 12 MB')
          const result:DraftImageResult={bytes,...(typeof item.revisedPrompt==='string'?{revisedPrompt:item.revisedPrompt}:{}),...(typeof item.model==='string'?{imageModel:item.model}:{}),...(Array.isArray(item.inputImages)?{inputImages:item.inputImages.map(value=>{const row=record(value);if(typeof row.path!=='string'||typeof row.sha256!=='string')throw new Error('图像输入指纹报告无效');return{path:row.path,sha256:row.sha256}})}:{})}
          if(settled)return;settled=true;cleanup();resolve(result)
        }catch(e){fail(e instanceof Error?e:new Error('无法读取生成图片'))}
      }
      const handle=(message:{method?:string;params?:unknown})=>{
        const p=record(message.params);if(settled||p.threadId!==threadId)return;const id=p.turnId??record(p.turn).id;if(typeof id!=='string')return;if(!turnId){early.push(message);return}if(id!==turnId)return
        const item=record(p.item)
        if(message.method==='item/completed'&&item.type==='agentMessage'&&typeof item.text==='string')lastText=item.text.slice(0,1000)
        if(message.method==='item/started'&&item.type==='imageGeneration'){imageCalls++;input.emit('平台正在生成图像草稿');if(imageCalls>1)fail(new Error('每轮只允许生成一张草稿，已停止额外调用'))}
        if(message.method==='item/completed'&&item.type==='imageGeneration')void image(item)
        if(message.method==='item/started'&&['commandExecution','fileChange','mcpToolCall','dynamicToolCall','collabAgentToolCall'].includes(String(item.type)))fail(new Error('图像草稿任务不允许其他工具操作'))
        if(message.method==='error'&&p.willRetry===false)fail(new Error(String(record(p.error).message||'Codex 图像生成失败')))
        if(message.method==='turn/completed'&&!reading)fail(new Error(String(record(record(p.turn).error).message||(lastText?`本轮未返回平台生成图片：${lastText}`:'本轮没有返回平台生成图片，请确认账号和模型支持图像生成'))))
      }
      rpc.listeners.add(handle);rpc.exits.add(fail);input.signal.addEventListener('abort',abort,{once:true});if(input.signal.aborted){abort();return}
      void rpc.request('turn/start',{threadId,cwd:input.cwd,approvalPolicy:'never',sandboxPolicy:{type:'workspaceWrite',writableRoots:[input.cwd],networkAccess:false,excludeSlashTmp:true,excludeTmpdirEnvVar:true},input:[{type:'text',text:input.content,text_elements:[]},...input.paths.map(path=>({type:'localImage',path}))],...(input.model?{model:input.model}:{})}).then(value=>{turnId=String(record(record(value).turn).id??'');if(!turnId){fail(new Error('Codex 未返回图像轮次 ID'));return}for(const event of early)handle(event)}).catch(fail)
    })
    }catch(error){input.signal.throwIfAborted();throw error}finally{await this.dispose()}
  }
}
