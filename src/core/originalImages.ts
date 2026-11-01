// Optional browser cache. Portable projects retain their bounded previews independently.
interface OriginalImage {sha256:string;blob:Blob;width:number;height:number;used:number}
const database='fastfigure.original-images.v1',store='images',maxBytes=96_000_000,maxCount=24
export function evictOriginalImages(rows:{sha256:string;bytes:number;used:number}[]){let bytes=0;return [...rows].sort((a,b)=>b.used-a.used).filter((row,i)=>{bytes+=row.bytes;return i>=maxCount||bytes>maxBytes}).map(row=>row.sha256)}
async function open():Promise<IDBDatabase|null>{
  let factory:IDBFactory;try{if(typeof indexedDB==='undefined')return null;factory=indexedDB}catch{return null}
  return new Promise<IDBDatabase|null>(resolve=>{const request=factory.open(database,1);request.onupgradeneeded=()=>request.result.createObjectStore(store,{keyPath:'sha256'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null)}).catch(()=>null)
}
export async function cacheOriginalImage(sha256:string,blob:Blob,width:number,height:number):Promise<boolean>{
  if(!/^[a-f\d]{64}$/.test(sha256)||blob.size>12_000_000||width<=0||height<=0||width*height>24_000_000)return false
  const db=await open();if(!db)return false
  return new Promise<boolean>(resolve=>{const tx=db.transaction(store,'readwrite'),images=tx.objectStore(store);images.put({sha256,blob,width,height,used:Date.now()} satisfies OriginalImage)
    const list=images.getAll();list.onsuccess=()=>{for(const key of evictOriginalImages((list.result as OriginalImage[]).map(r=>({sha256:r.sha256,bytes:r.blob.size,used:r.used}))))images.delete(key)}
    tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=tx.onabort=()=>{db.close();resolve(false)}
  }).catch(()=>false)
}
export async function originalImage(sha256:string):Promise<OriginalImage|null>{
  const db=await open();if(!db)return null
  return new Promise<OriginalImage|null>(resolve=>{const tx=db.transaction(store,'readwrite'),images=tx.objectStore(store),request=images.get(sha256);let row:OriginalImage|null=null
    request.onsuccess=()=>{row=request.result as OriginalImage??null;if(row)images.put({...row,used:Date.now()})}
    tx.oncomplete=()=>{db.close();resolve(row)};tx.onerror=tx.onabort=()=>{db.close();resolve(null)}
  }).catch(()=>null)
}
export async function removeOriginalImage(sha256:string):Promise<void>{const db=await open();if(!db)return;await new Promise<void>(resolve=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(sha256);tx.oncomplete=tx.onerror=tx.onabort=()=>{db.close();resolve()}})}
