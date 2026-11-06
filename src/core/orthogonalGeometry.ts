export interface ArrowPoint{x:number;y:number}
export function appendArrowPoint(points:ArrowPoint[],point:ArrowPoint):ArrowPoint[]{
  const last=points.at(-1);if(!last)return[{...point}]
  if(Math.hypot(last.x-point.x,last.y-point.y)<.01)return points.map(p=>({...p}))
  return[...points.map(p=>({...p})),...(last.x!==point.x&&last.y!==point.y?[{x:point.x,y:last.y}]:[]),{...point}]
}
export function moveArrowPoint(points:ArrowPoint[],index:number,point:ArrowPoint):ArrowPoint[]{
  const next=points.map(p=>({...p})),old=points[index];if(!old)return next
  next[index]={...point}
  for(const neighbor of [index-1,index+1]){
    const before=points[neighbor],after=next[neighbor];if(!before||!after)continue
    if(Math.abs(before.x-old.x)<.001)after.x=point.x;else after.y=point.y
  }
  return next
}
export function compactArrowPoints(points:ArrowPoint[]):ArrowPoint[]{
  const result:ArrowPoint[]=[]
  for(const point of points){
    if(result.length&&Math.hypot(result.at(-1)!.x-point.x,result.at(-1)!.y-point.y)<.01)continue
    while(result.length>1){const a=result.at(-2)!,b=result.at(-1)!;if(a.x===b.x&&b.x===point.x||a.y===b.y&&b.y===point.y)result.pop();else break}
    result.push({...point})
  }
  return result
}
