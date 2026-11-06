import {shallowRef} from 'vue'
import type {ComponentAsset} from '../core/assets'
import type {NodeKind} from '../core/model'
import type {NodeExtras} from '../core/libraryPlacement'

export type LibraryDragItem={kind:'node';nodeKind:NodeKind;label:string;extras?:NodeExtras}|{kind:'asset';asset:ComponentAsset|(()=>Promise<ComponentAsset>)}
const mime='application/x-fastfigure-library'

/** Only a drag started by this editor can insert content; the transfer contains an opaque token. */
export function createLibraryDrag(){
  const active=shallowRef<{token:string;item:LibraryDragItem}|null>(null)
  function clear(){active.value=null}
  function start(event:DragEvent,item:LibraryDragItem){
    if(!event.dataTransfer){event.preventDefault();return}
    event.stopPropagation()
    const token=crypto.randomUUID();active.value={token,item}
    event.dataTransfer.clearData();event.dataTransfer.setData(mime,token);event.dataTransfer.effectAllowed='copy'
  }
  function accepts(event:DragEvent){return!!active.value&&!!event.dataTransfer?.types.includes(mime)}
  function take(event:DragEvent){
    const source=active.value
    if(!source||!accepts(event)||event.dataTransfer!.getData(mime)!==source.token)return null
    clear();return source.item
  }
  return{active,start,clear,accepts,take}
}
