import { describe,expect,it } from 'vitest'
import { clone,createExample } from './model'
import { repairContentChanged } from './repairPlan'

describe('repair plan content progress',()=>{
  it('ignores only reconstruction counters while retaining visible and source changes',()=>{
    const before=createExample();before.nodes[0]!.reconstruction={objectId:'label',version:0}
    before.containers[0]!.reconstruction={referenceSha256:'a'.repeat(64),sourceWidth:800,sourceHeight:400,region:{x:0,y:0,width:1,height:1},origin:{x:16,y:16},scale:1,revision:0,regions:[],warnings:[]}
    const after=clone(before);after.nodes[0]!.reconstruction!.version++;after.containers[0]!.reconstruction!.revision++
    expect(repairContentChanged(before,after)).toBe(false);expect(before.nodes[0]!.reconstruction!.version).toBe(0)
    const changed=clone(after);changed.nodes[0]!.textStyle={italic:true};expect(repairContentChanged(before,changed)).toBe(true)
    const source=clone(after);source.nodes[0]!.reconstruction!.owner='new-region';expect(repairContentChanged(before,source)).toBe(true)
  })
  it('preserves drawing order as progress even when object fields are unchanged',()=>{
    const before=createExample(),after=clone(before);after.nodes.reverse();expect(repairContentChanged(before,after)).toBe(true)
    const renamed=clone(before);renamed.nodes[0]!.label='Corrected text';expect(repairContentChanged(before,renamed)).toBe(true)
  })
})
