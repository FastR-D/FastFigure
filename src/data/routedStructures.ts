import {z} from 'zod'
import type {FigureNode,ComponentSource} from '../core/model.ts'
import {createStructureBuilder} from './structureBuilder.ts'

const count=(min:number,max:number)=>z.coerce.number().int().min(min).max(max)
export const routedStructureIds=['graph-message-passing','top1-expert-routing'] as const
export const routedStructureSchemas=[
  z.object({id:z.literal('graph-message-passing'),neighbors:count(2,5)}).strict(),
  z.object({id:z.literal('top1-expert-routing'),experts:count(2,5),activeExpert:count(1,5)}).strict(),
] as const
const schema=z.discriminatedUnion('id',routedStructureSchemas)
type Parameters=z.infer<typeof schema>
export const isRoutedStructure=(p:{id:string}):p is Parameters=>(routedStructureIds as readonly string[]).includes(p.id)
export const routedStructureSemantics={
  'graph-message-passing':{relation:'One local update of v: each neighbor u has message Mᵗ(hv,hu,e), sum aggregation produces m, and Uᵗ uses both m and the old state hv to produce the next state. Ego-neighborhood arrows are incoming messages, not directed graph topology. Matching u labels correspond to the expanded message branches. No learned attention, self-loop, full graph readout, numeric edge features or molecular geometry is implied.',labels:'graph-v, neighbor-i, neighbor-message-i; message-i, aggregate, update, next-state; old-state-link carries hv directly to U. Neighbor count is an illustrated local degree, not an observation or whole-graph size.'},
  'top1-expert-routing':{relation:'One illustrative token x feeds a softmax router and top-1 dispatch. Only the explicitly selected expert receives a data path; its output is multiplied by its gate p_i(x). Dashed router links carry selection/control or the gate value. Inactive expert cards are alternatives, not executed branches. No gate values are fabricated or computed; activeExpert is an explicit illustrative choice, not an argmax calculation. No capacity overflow, auxiliary loss, residual, attention block or full Switch Transformer is included.',labels:'route-input, router, dispatch, expert-i (zero based), gate-scale, route-output; selected-in/out are the only executed expert paths; gate-value supplies the separate router weight. activeExpert is one based and must not exceed experts.'},
} as const
export const routedStructureSources:Record<typeof routedStructureIds[number],ComponentSource[]>={
  'graph-message-passing':[{title:'Neural Message Passing for Quantum Chemistry · §2 / Eq. 1–2',reference:'https://proceedings.mlr.press/v70/gilmer17a.html · 独立构造局部邻域与消息函数、求和聚合、旧状态更新的对应。只表示一次局部更新，无原文分子、几何、实验值、注意力或全图读出；示意邻居数不代表观测。'}],
  'top1-expert-routing':[{title:'Switch Transformers · Fig. 2 / §2.1',reference:'https://www.jmlr.org/papers/v23/21-0998.html · 独立抽象单 token 的 top-1 路由与门控加权。选中专家为显式示意，不计算／填造概率；保留数据路径和虚线门控的区别。不含容量溢出、辅助损失、残差及完整 Transformer。'}],
}

export function routedStructureFigure(raw:Parameters){
  const p=schema.parse(raw),{root,text,shape,path,bind,group,finish}=createStructureBuilder()
  function connect(id:string,a:FigureNode,b:FigureNode,color=0){const points=[{x:a.x+a.width,y:a.y+a.height/2},{x:b.x,y:b.y+b.height/2}];bind(path(id,points,'filled',false,color),a,b,points)}
  if(p.id==='graph-message-passing'){
    root.width=980;root.height=540
    text('neighborhood-heading','Local neighborhood of v',20,62,340,28,16,'stage',true);text('message-heading','Messages Mᵗ',404,62,176,28,16,'stage',true);text('update-heading','Aggregate + update',602,62,352,28,16,'stage',true)
    const v=shape('graph-v','v',178,218,64,64,0,'stage',true),aggregate=shape('aggregate','Σ',632,224,52,52,1,'stage',true),update=shape('update','Update Uᵗ',746,226,116,48,2),next=shape('next-state','hᵥᵗ⁺¹',900,226,64,48,2)
    for(let i=0;i<p.neighbors;i++){
      const angle=Math.PI*(1.45-.9*i/(p.neighbors-1)),cx=210+140*Math.cos(angle),cy=250+140*Math.sin(angle),neighbor=shape(`neighbor-${i}`,`u${i+1}`,cx-22,cy-22,44,44,4,'stage',true),toward={x:-Math.cos(angle),y:-Math.sin(angle)},points=[{x:cx+22*toward.x,y:cy+22*toward.y},{x:210-32*toward.x,y:250-32*toward.y}]
      bind(path(`neighbor-message-${i}`,points,'filled',false,4),neighbor,v,points)
      const message=shape(`message-${i}`,`Mᵗ(v,u${i+1},e)`,416,234+(i-(p.neighbors-1)/2)*54,160,32,4)
      connect(`aggregate-in-${i}`,message,aggregate,1)
    }
    connect('aggregate-update',aggregate,update,1);connect('updated-state',update,next,2)
    const old=[{x:242,y:250},{x:350,y:250},{x:350,y:424},{x:804,y:424},{x:804,y:274}];bind(path('old-state-link',old,'filled'),v,update,old)
    text('old-state-label','Old state hᵥᵗ also enters Uᵗ',438,388,340,24,14)
    text('message-formula','mᵥ = Σᵤ Mᵗ(hᵥᵗ,hᵤᵗ,eᵥᵤ);  hᵥᵗ⁺¹ = Uᵗ(hᵥᵗ,mᵥ)',24,462,932,30,16)
    return finish('Neighborhood message passing','One local update; graph context and message expansion share u labels. No readout or numeric features.')
  }
  if(p.activeExpert>p.experts)throw new Error('选中专家编号不能超过专家数量；请明确选择一个存在的示意专家')
  root.width=960;root.height=Math.max(400,160+p.experts*68)
  const cy=122+(p.experts-1)*34,input=shape('route-input','Token x',24,cy-24,112,48,0),router=shape('router','Router · Softmax',192,54,156,48,1),dispatch=shape('dispatch','Top-1',254,cy-24,96,48,1),scale=shape('gate-scale','× pᵢ',708,cy-22,64,44,2),output=shape('route-output','y',824,cy-24,108,48,2)
  connect('token-dispatch',input,dispatch)
  const routerInput=[{x:80,y:cy-24},{x:80,y:78},{x:192,y:78}];bind(path('token-router',routerInput,'filled'),input,router,routerInput)
  const control=[{x:270,y:102},{x:270,y:cy-40},{x:302,y:cy-40},{x:302,y:cy-24}],controlLine=path('route-choice',control,'filled',false,1);controlLine.visual!.dash=[4,3];bind(controlLine,router,dispatch,control)
  text('choice-label','index i*',354,54,72,22,11)
  group('expert-bank','Expert alternatives',448,84,180,p.experts*68+8)
  text('expert-heading','Experts · one selected',430,50,236,26,15,'stage',true)
  const experts=Array.from({length:p.experts},(_,i)=>{const n=shape(`expert-${i}`,`Expert ${i+1}`,464,100+i*68,148,44,i===p.activeExpert-1?0:4,'expert-bank');if(i!==p.activeExpert-1)n.visual={...n.visual,fill:'#f6f7fa',stroke:'#bec7d4'};else n.visual!.fill='#e0f2ea';return n}),chosen=experts[p.activeExpert-1]!,incoming=[{x:350,y:cy},{x:390,y:cy},{x:390,y:chosen.y+22},{x:464,y:chosen.y+22}],outgoing=[{x:612,y:chosen.y+22},{x:654,y:chosen.y+22},{x:654,y:cy},{x:708,y:cy}]
  bind(path('selected-in',incoming,'filled'),dispatch,chosen,incoming);bind(path('selected-out',outgoing,'filled',false,2),chosen,scale,outgoing);connect('weighted-output',scale,output,2)
  const gate=[{x:348,y:78},{x:370,y:78},{x:370,y:81},{x:690,y:81},{x:690,y:cy-36},{x:740,y:cy-36},{x:740,y:cy-22}],gateLine=path('gate-value',gate,'filled',false,1);gateLine.visual!.dash=[4,3];bind(gateLine,router,scale,gate)
  text('gate-label','pᵢ*(x)',638,90,48,24,12)
  text('routing-formula','i* = argmaxᵢ pᵢ(x);  y = pᵢ*(x) · Eᵢ*(x)',24,root.height-56,912,24,16)
  return finish('Top-1 expert routing','Highlighted route is an explicit illustration, not a computed gate decision. No capacity or overflow model.')
}
