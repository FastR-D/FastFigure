import {describe,it,expect} from 'vitest'
import {createBlank} from './model'
import {snapSelection} from './alignmentSnap'
const figure=()=>{const doc=createBlank();doc.nodes=[{id:'moving',parentId:'stage',kind:'rectangle' as const,label:'Move',x:100,y:200,width:100,height:60},{id:'reference',parentId:'stage',kind:'rectangle' as const,label:'Reference',x:300,y:200,width:120,height:60}];return doc}
describe('drag alignment',()=>{
  it('snaps edges and centers while leaving the source document unchanged',()=>{
    const doc=figure(),result=snapSelection(doc,['moving'],{x:198,y:203,width:100,height:60},5)
    expect(result).toMatchObject({x:200,y:200});expect(result.guides.map(g=>g.axis)).toEqual(['x','y']);expect(doc.nodes[0]!.x).toBe(100)
    expect(snapSelection(doc,['moving'],{x:312,y:320,width:100,height:60},5).x).toBe(310)
  })
  it('releases outside tolerance and excludes the selected subtree and other parents',()=>{
    const doc=figure();expect(snapSelection(doc,['moving','reference'],{x:211,y:311,width:320,height:60},5).guides).toEqual([])
    expect(snapSelection(doc,['moving'],{x:184,y:313,width:100,height:60},5).guides).toEqual([])
    doc.containers.push({id:'group',parentId:'stage',role:'component',title:'Group',x:300,y:180,width:200,height:120});doc.nodes[1]!.parentId='group'
    expect(snapSelection(doc,['moving'],{x:199,y:202,width:100,height:60},.5).guides).toEqual([])
  })
  it('keeps managed chart points on their exact drag coordinates',()=>{
    const doc=figure();doc.nodes[0]!.chart={role:'series',series:0,channels:['fill']}
    expect(snapSelection(doc,['moving'],{x:198,y:203,width:100,height:60},5)).toEqual({x:198,y:203,guides:[]})
  })
})
