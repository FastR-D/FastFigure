import {catalogueAsset,catalogueKey,type CatalogueEntry} from '../../src/core/catalogue.ts'
import {componentFromSnapshot,componentSnapshotJson} from '../../src/core/componentRepository.ts'
import {repositoryRecallSchema,scoreComponentMetadata,type RepositoryRecall} from '../../src/core/repositoryRecall.ts'
import type {RepositorySelection} from '../../src/core/repositorySelection.ts'
import type {ComponentLibraryStore} from './store.ts'
import {createHash} from 'node:crypto'

/** Read and freeze bounded server-owned snapshots before any model work starts. */
function collectCandidates(store:ComponentLibraryStore,query:string,initial:CatalogueEntry[],limit:number,reportQuery=query){
  const found=store.recommend(query,limit),candidates=initial.map((entry,index)=>{const asset=catalogueAsset(entry);return{entry,asset,score:scoreComponentMetadata(asset,found.groups).score,priority:entry.kind==='asset'?0:1,index}}),matches:RepositoryRecall['matches']=[]
  for(const match of found.matches){
    const row:RepositoryRecall['matches'][number]={snapshotId:match.record.id,name:match.record.name,revision:match.record.revision,score:match.score,matched:match.matched,decision:'not-selected'}
    try{
      const raw=store.read(match.record.id),asset=componentFromSnapshot(raw.asset,match.record.id),json=componentSnapshotJson(asset),existing=candidates.find(item=>item.entry.kind==='asset'&&componentSnapshotJson(item.asset)===json)
      if(existing){row.componentKey=catalogueKey(existing.entry);row.decision='already-attached';existing.score=Math.max(existing.score,match.score)}
      else{const base=`library-${match.record.id}`;let id=base,suffix=1;while(candidates.some(item=>item.asset.id===id))id=`${base}-${suffix++}`;asset.id=id;const entry:CatalogueEntry={kind:'asset',asset};row.componentKey=catalogueKey(entry);candidates.push({entry,asset,score:match.score,priority:0,index:candidates.length})}
    }catch(error){row.decision='unavailable';row.note=(error instanceof Error?error.message:'素材不可用').slice(0,240)}
    matches.push(row)
  }
  const ranked=candidates.length>initial.length?candidates.sort((a,b)=>b.score-a.score||a.priority-b.priority||a.index-b.index):candidates
  const report=repositoryRecallSchema.parse({version:2,engine:'metadata-keywords-v2',query:reportQuery,groups:found.groups,terms:found.terms,omittedTerms:found.omittedTerms,candidatePoolLimit:24,candidatePoolCapped:found.candidatePoolCapped||ranked.length>24,matches,catalogue:[]})
  return{candidates:ranked.slice(0,24).map(item=>item.entry),report,workingKeys:initial.filter(entry=>entry.kind==='asset').map(catalogueKey)}
}
export type RecallCandidates=ReturnType<typeof collectCandidates>
/** Select only from server-frozen candidates; no database reads or model-supplied structures. */
export function finalizeComponentCatalogue(prepared:RecallCandidates,keys:string[],selection?:RepositorySelection){
  const available=new Map(prepared.candidates.map(entry=>[catalogueKey(entry),entry]))
  if(keys.length>6||new Set(keys).size!==keys.length||keys.some(key=>!available.has(key)))throw new Error('筛选结果引用了无效的冻结素材')
  const catalogue=keys.map(key=>available.get(key)!),matches=prepared.report.matches.map(row=>({...row}))
  for(const match of matches)if(match.decision!=='unavailable'){
    match.decision=match.componentKey&&keys.includes(match.componentKey)?prepared.workingKeys.includes(match.componentKey)?'already-attached':'included':'not-selected'
    if(match.decision==='not-selected')match.note='未进入本轮至多六项参考清单'
  }
  const report=repositoryRecallSchema.parse({...prepared.report,...(selection?{selection}:{}),matches,catalogue:catalogue.map(entry=>{const asset=catalogueAsset(entry),key=catalogueKey(entry),match=matches.find(row=>row.componentKey===key&&row.decision!=='unavailable');return{key,name:asset.name,revision:asset.updatedAt,...(match?{snapshotId:match.snapshotId}:{})}})})
  return{catalogue,report}
}
export function recallComponentCatalogue(store:ComponentLibraryStore,query:string,initial:CatalogueEntry[]){const prepared=collectCandidates(store,query,initial,6);return finalizeComponentCatalogue(prepared,prepared.candidates.slice(0,6).map(catalogueKey))}
export function prepareComponentSelection(store:ComponentLibraryStore,query:string,initial:CatalogueEntry[],reportQuery=query){
  const prepared=collectCandidates(store,query,initial,24,reportQuery),keys=new Set(prepared.candidates.map(catalogueKey))
  prepared.report.matches=prepared.report.matches.map(row=>row.decision==='unavailable'?row:{...row,decision:row.componentKey&&keys.has(row.componentKey)?'candidate':'not-selected',...(!row.componentKey||!keys.has(row.componentKey)?{note:'未进入本轮至多 24 项筛选候选'}:{})})
  prepared.report.selection={status:prepared.candidates.length?'pending':'skipped',message:prepared.candidates.length?'已固定候选，等待助手逐项筛选':'没有候选，跳过模型筛选',choices:[],candidates:prepared.candidates.map(entry=>{const asset=catalogueAsset(entry),key=catalogueKey(entry),match=prepared.report.matches.find(row=>row.componentKey===key&&row.decision!=='unavailable');return{key,name:asset.name,revision:asset.updatedAt,assetSha256:createHash('sha256').update(componentSnapshotJson(asset)).digest('hex'),...(match?{snapshotId:match.snapshotId}:{})}})}
  return prepared
}
