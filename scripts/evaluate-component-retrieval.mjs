// Offline relevance comparison through the production SQLite recommender. Never invokes a model.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {parseArgs} from 'node:util'
import {createServer} from 'vite'

const {values}=parseArgs({options:{dataset:{type:'string',default:'benchmarks/component-retrieval-v1'},output:{type:'string'}}})
assert(values.output,'Pass a fresh --output directory')
const dataset=resolve(values.dataset),output=resolve(values.output)
assert(!existsSync(output),'Preserve the previous result; choose a fresh output directory')
const bytes=readFileSync(join(dataset,'manifest.json')),manifest=JSON.parse(bytes)
assert.equal(manifest.version,'component-retrieval-v1')
assert.equal(new Set(manifest.corpus.map(row=>row.id)).size,manifest.corpus.length)
for(const row of manifest.cases)for(const id of [...row.relevant,...(row.forbidden??[])])assert(manifest.corpus.some(asset=>asset.id===id),`Unknown judgment: ${id}`)
mkdirSync(output,{recursive:true})
const directory=mkdtempSync(join(tmpdir(),'fastfigure-retrieval-eval-')),server=await createServer({configFile:false,cacheDir:join(directory,'.vite'),server:{watch:null}})
const sha=value=>createHash('sha256').update(value).digest('hex'),save=(name,value)=>writeFileSync(join(output,name),JSON.stringify(value,null,2))
let store
try{
  const {ComponentLibraryStore}=await server.ssrLoadModule('/server/componentLibrary/store.ts'),{catalogueAsset}=await server.ssrLoadModule('/src/core/catalogue.ts')
  store=new ComponentLibraryStore(directory)
  const keys=new Map(),corpus=[]
  for(const [index,row] of manifest.corpus.entries()){
    const asset=catalogueAsset(row.recipe?{kind:'recipe',id:row.recipe}:{kind:'seed',id:row.seed},row.parameters)
    Object.assign(asset,{id:`fixture-${index+100}`,name:row.name,tags:row.tags,description:row.description,sources:[],lineage:[]})
    const saved=store.publish({asset}).record;keys.set(saved.id,row.id);corpus.push({fixtureId:row.id,snapshotId:saved.id,asset})
  }
  // Fixture dates control tie ordering, independent of machine speed; only this temporary DB is changed.
  const db=new DatabaseSync(join(directory,'components.sqlite'))
  try{for(const [index,row]of corpus.entries()){const record=store.read(row.snapshotId).record;record.savedAt=new Date(Date.UTC(2026,9,30,0,0,index)).toISOString();db.prepare('UPDATE snapshots SET saved_at=?,metadata_json=? WHERE id=?').run(record.savedAt,JSON.stringify(record),row.snapshotId)}}finally{db.close()}
  const cases=manifest.cases.map(row=>{
    const query=(row.prefix??'').repeat(row.repeats??1)+row.query,result=store.recommend(query),ranked=result.matches.map(match=>({id:keys.get(match.record.id),score:match.score,matched:match.matched})),ids=ranked.map(item=>item.id),first=ids.findIndex(id=>row.relevant.includes(id))
    return{id:row.id,split:row.split,query,relevant:row.relevant,forbidden:row.forbidden??[],ranked,terms:result.terms,...(result.groups?{groups:result.groups}:{}),omittedTerms:result.omittedTerms,candidatePoolCapped:result.candidatePoolCapped,top1:row.relevant.length?row.relevant.includes(ids[0]):ids.length===0,recallAt6:row.relevant.length?row.relevant.filter(id=>ids.includes(id)).length/row.relevant.length:null,reciprocalRank:first<0?0:1/(first+1),forbiddenReturned:ids.filter(id=>(row.forbidden??[]).includes(id))}
  })
  const summarize=rows=>{const positive=rows.filter(row=>row.relevant.length);return{cases:rows.length,top1Success:rows.filter(row=>row.top1).length,positiveCases:positive.length,meanRecallAt6:positive.reduce((sum,row)=>sum+row.recallAt6,0)/positive.length,meanReciprocalRank:positive.reduce((sum,row)=>sum+row.reciprocalRank,0)/positive.length,forbiddenCases:rows.filter(row=>row.forbidden.length).length,forbiddenCasesReturned:rows.filter(row=>row.forbiddenReturned.length).length}}
  const sources={};mkdirSync(join(output,'source-snapshots'))
  for(const path of ['src/core/repositoryRecall.ts','server/componentLibrary/store.ts','scripts/evaluate-component-retrieval.mjs']){const name=path.replaceAll('/','__');sources[path]=sha(readFileSync(path));copyFileSync(path,join(output,'source-snapshots',name))}
  copyFileSync(join(dataset,'manifest.json'),join(output,'manifest.json'));save('corpus.json',corpus)
  const report={version:manifest.version,createdAt:new Date().toISOString(),datasetSha256:sha(bytes),sources,provenance:manifest.provenance,summary:Object.fromEntries(['development','validation'].map(split=>[split,summarize(cases.filter(row=>row.split===split))])),cases}
  save('evaluation.json',report);console.log(JSON.stringify({output,summary:report.summary}))
}finally{store?.close();await server.close();rmSync(directory,{recursive:true,force:true})}
