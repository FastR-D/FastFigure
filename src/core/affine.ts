export interface Point {x:number;y:number}
export type Linear=[number,number,number,number]
export type Affine=[number,number,number,number,number,number]
export const identity:Affine=[1,0,0,1,0,0]
export function multiply(a:Affine,b:Affine):Affine {return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
export function transform(p:Point,m:Affine|Linear):Point {return {x:m[0]*p.x+m[2]*p.y+(m.length===6?m[4]:0),y:m[1]*p.x+m[3]*p.y+(m.length===6?m[5]:0)}}
export function inverse(m:Linear):Linear {const det=m[0]*m[3]-m[1]*m[2];if(Math.abs(det)<1e-10)throw new Error('变换矩阵不能退化');return [m[3]/det,-m[1]/det,-m[2]/det,m[0]/det]}
export function parseTransform(value:string):Affine {
  let matrix=[...identity] as Affine,last=0
  for(const item of value.matchAll(/([A-Za-z]+)\s*\(([^()]*)\)/g)) {
    if(value.slice(last,item.index).trim().replaceAll(',',''))throw new Error('SVG 变换语法无效')
    const text=item[2]!,tokens=[...text.matchAll(/[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/g)]
    let end=0;for(const token of tokens){if(text.slice(end,token.index).trim().replaceAll(',',''))throw new Error('SVG 变换参数无效');end=token.index!+token[0].length}
    if(text.slice(end).trim().replaceAll(',',''))throw new Error('SVG 变换参数无效')
    const n=tokens.map(t=>Number(t[0]));if(n.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7))throw new Error('SVG 变换数值超限')
    const angle=(n[0]??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle)
    let next:Affine
    switch(item[1]) {
      case 'matrix':if(n.length!==6)throw new Error('matrix 需要 6 个参数');next=n as Affine;break
      case 'translate':if(n.length<1||n.length>2)throw new Error('translate 参数无效');next=[1,0,0,1,n[0]!,n[1]??0];break
      case 'scale':if(n.length<1||n.length>2)throw new Error('scale 参数无效');next=[n[0]!,0,0,n[1]??n[0]!,0,0];break
      case 'rotate':if(n.length!==1&&n.length!==3)throw new Error('rotate 参数无效');next=[c,s,-s,c,0,0];if(n.length===3)next=multiply(multiply([1,0,0,1,n[1]!,n[2]!],next),[1,0,0,1,-n[1]!,-n[2]!]);break
      case 'skewX':case 'skewY':if(n.length!==1)throw new Error('skew 参数无效');next=item[1]==='skewX'?[1,0,Math.tan(angle),1,0,0]:[1,Math.tan(angle),0,1,0,0];break
      default:throw new Error(`暂不支持 SVG 变换 ${item[1]}`)
    }
    matrix=multiply(matrix,next);last=item.index!+item[0].length
  }
  if(value.slice(last).trim().replaceAll(',',''))throw new Error('SVG 变换语法无效')
  if(matrix.some(v=>!Number.isFinite(v)||Math.abs(v)>1e8)||Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])<1e-10)throw new Error('SVG 变换退化或超限')
  return matrix
}
