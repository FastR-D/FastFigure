const directions=['east','south','west','north'] as const
const vectors={east:[1,0,0],south:[0,1,0],west:[-1,0,1],north:[0,-1,1]} as const
export function drawioGradientVector(direction='south',shapeDirection='east'){
  const a=directions.indexOf(direction as typeof directions[number]),b=directions.indexOf(shapeDirection as typeof directions[number])
  if(a<0||b<0)throw new Error('draw.io 渐变和形状方向须为 north / south / east / west')
  return vectors[directions[(a+b)%4]!]
}
