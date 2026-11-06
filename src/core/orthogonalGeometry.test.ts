import {describe,it,expect} from 'vitest'
import {appendArrowPoint,moveArrowPoint,compactArrowPoints} from './orthogonalGeometry'
import {createBlank} from './model'
import {applyMaterialEdits} from './materialEditing'
import {movePathPoint,pathPoints} from './paths'
const isOrthogonal=(points:{x:number;y:number}[])=>points.slice(1).every((p,i)=>Math.abs(p.x-points[i]!.x)<1e-6||Math.abs(p.y-points[i]!.y)<1e-6)
describe('interactive right-angle arrows',()=>{
  it('adds corners from clicks and moves neighboring segments when a point is dragged',()=>{
    const clicked=[{x:100,y:180},{x:300,y:300},{x:600,y:300}],points=clicked.reduce((all,p)=>appendArrowPoint(all,p),[] as {x:number;y:number}[])
    expect(points).toEqual([{x:100,y:180},{x:300,y:180},{x:300,y:300},{x:600,y:300}])
    const moved=moveArrowPoint(points,1,{x:320,y:200});expect(isOrthogonal(moved)).toBe(true);expect(moved[1]).toEqual({x:320,y:200});expect(points[1]).toEqual({x:300,y:180})
    expect(compactArrowPoints([...moved,moved.at(-1)!])).toEqual(moved)
  })
  it('retains the arrow and right angles when editing saved native path points',()=>{
    const result=applyMaterialEdits(createBlank(),[{kind:'arrow',parentId:'stage',points:[{x:100,y:180},{x:300,y:300},{x:600,y:300}],direction:'horizontal',arrow:'filled'}]),doc=result.figure,node=doc.nodes.at(-1)!
    expect(node.path!.orthogonal).toBe(true);movePathPoint(doc,node.id,1,{x:330,y:210})
    expect(isOrthogonal(pathPoints(doc,node))).toBe(true);expect(pathPoints(doc,node)[1]).toEqual({x:330,y:210});expect(node.path!.arrow).toBe('filled')
  })
})
