import svgpath from 'svgpath'
import { transform, type Affine } from './affine.ts'
import { mapPathPoints, type PathPoint } from './paths.ts'

export function parseSvgPath(data:string,matrix:Affine):PathPoint[] {
  if(data.length>100_000)throw new Error('单条 SVG 路径过长')
  const path=svgpath(data) as ReturnType<typeof svgpath>&{err:string}
  if(path.err)throw new Error(`SVG 路径语法无效：${path.err.slice(0,80)}`)
  path.abs().unshort().unarc()
  const points:PathPoint[]=[];let current={x:0,y:0},start={x:0,y:0},closed=false
  path.iterate(segment=>{
    const command=segment[0].toUpperCase(),n=segment.slice(1) as number[]
    if(n.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7))throw new Error('SVG 路径数值超限')
    if(closed&&command!=='M'&&command!=='Z'){points.push({...start,move:true});current={...start};closed=false}
    if(command==='Z'){if(points.length)points.at(-1)!.close=true;current={...start};closed=true;return}
    let point:PathPoint
    switch(command){
      case 'M':point={x:n[0]!,y:n[1]!,...(points.length?{move:true}:{})};start={x:point.x,y:point.y};closed=false;break
      case 'L':point={x:n[0]!,y:n[1]!};break
      case 'H':point={x:n[0]!,y:current.y};break
      case 'V':point={x:current.x,y:n[0]!};break
      case 'C':point={x:n[4]!,y:n[5]!,c1:{x:n[0]!,y:n[1]!},c2:{x:n[2]!,y:n[3]!}};break
      case 'Q':point={x:n[2]!,y:n[3]!,c1:{x:n[0]!,y:n[1]!}};break
      default:throw new Error(`暂不支持路径命令 ${command}`)
    }
    current={x:point.x,y:point.y};points.push(point)
    if(points.length>128)throw new Error('单条路径超过 128 个锚点，请先简化或拆分')
  })
  return mapPathPoints(points,p=>transform(p,matrix))
}
