import {componentContentAlgorithm,componentContentJson} from '../../src/core/componentContent.ts'
import {collectionSelectionJson} from '../../src/core/componentCaptureContract.ts'
import {createHash} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {homedir} from 'node:os'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {z} from 'zod'
import {parseAsset} from '../../src/core/assets.ts'
import {rootContainer} from '../../src/core/model.ts'
import {componentSnapshotJson,componentSnapshotSchema,publishComponentSchema,contentMatchInputSchema,repositoryScopeSchema,snapshotIdSchema,snapshotStateInputSchema,type ComponentSnapshot} from '../../src/core/componentRepository.ts'
import {rasterDimensions} from '../harness/raster.ts'
import {repositoryRecallTerms,scoreComponentMetadata} from '../../src/core/repositoryRecall.ts'
import {feedbackCanonicalJson,feedbackCaseSchema,feedbackContextSchema,feedbackInputSchema,feedbackRatingSchema,feedbackRecordSchema,type FeedbackContext,type FeedbackInput} from '../../src/core/retrievalFeedback.ts'

export class ComponentLibraryError extends Error{constructor(readonly status:number,message:string){super(message)}}
const querySchema=z.object({q:z.string().trim().max(200).default('').refine(q=>!q||q.split(/\s+/).length<=8,'最多使用八个检索词'),offset:z.coerce.number().int().min(0).max(1_000_000).default(0),limit:z.coerce.number().int().min(1).max(24).default(12),scope:repositoryScopeSchema.default('active')})
const sha=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex')
const snapshots='FROM snapshots AS s LEFT JOIN snapshot_archives AS a ON a.snapshot_id=s.id'
const feedbackQuery=z.object({q:z.string().trim().max(200).default(''),rating:feedbackRatingSchema.or(z.literal('all')).default('all'),runId:z.uuid().optional(),offset:z.coerce.number().int().min(0).max(1_000_000).default(0),limit:z.coerce.number().int().min(1).max(24).default(12)})
const latestFeedback='FROM retrieval_contexts c JOIN retrieval_feedback f ON f.sequence=(SELECT MAX(r.sequence) FROM retrieval_feedback r WHERE r.case_id=c.id)'
function feedbackFilter(input:unknown){const parsed=feedbackQuery.safeParse(input);if(!parsed.success)throw new ComponentLibraryError(400,'素材反馈检索参数无效');const value=parsed.data,conditions:string[]=[],parameters:string[]=[];if(value.q){conditions.push('instr(c.search_text,?)>0');parameters.push(value.q.toLowerCase())}if(value.rating!=='all'){conditions.push('json_extract(f.record_json,\'$.rating\')=?');parameters.push(value.rating)}if(value.runId){conditions.push('c.run_id=?');parameters.push(value.runId)}return{...value,where:conditions.length?' WHERE '+conditions.join(' AND '):'',parameters}}
function feedbackRevision(row:Record<string,unknown>){try{const record=feedbackRecordSchema.parse(JSON.parse(String(row.record_json)));if(sha(feedbackCanonicalJson(record))!==row.record_sha256)throw new Error('hash');return{record,sha256:String(row.record_sha256)}}catch{throw new ComponentLibraryError(503,'素材反馈记录与指纹不符，请保留数据库并核对备份')}}
function recordJson(value:unknown,archivedAt:unknown=null){if(typeof value!=='string')throw new ComponentLibraryError(503,'本机素材记录损坏，请保留素材库文件并检查备份');try{return componentSnapshotSchema.parse({...JSON.parse(value),archivedAt:archivedAt??undefined})}catch{throw new ComponentLibraryError(503,'本机素材记录损坏，请保留素材库文件并检查备份')}}

/** Immutable snapshots in one transaction-safe, local-user SQLite store. Open only on demand. */
export class ComponentLibraryStore{
  readonly directory:string
  private database?:DatabaseSync
  private feedbackDatabase?:DatabaseSync
  constructor(directory=process.env.FASTFIGURE_LIBRARY_DIR??join(homedir(),'.local','share','fastfigure','components'),private limits={maxEntries:10_000,maxBytes:2_000_000_000}){this.directory=resolve(directory)}
  private db(){
    if(!this.database){
      mkdirSync(this.directory,{recursive:true,mode:0o700})
      const db=new DatabaseSync(join(this.directory,'components.sqlite'))
      try{db.exec('PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, asset_json TEXT NOT NULL, metadata_json TEXT NOT NULL, search_text TEXT NOT NULL, saved_at TEXT NOT NULL, bytes INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS snapshots_recent ON snapshots(saved_at DESC, id); CREATE TABLE IF NOT EXISTS snapshot_content (snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id),algorithm TEXT NOT NULL,content_hash TEXT,error INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS snapshot_content_hash ON snapshot_content(algorithm,content_hash); CREATE TABLE IF NOT EXISTS snapshot_archives (snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id), archived_at TEXT NOT NULL);');this.database=db}catch(error){db.close();throw error}
    }
    return this.database
  }
  close(){this.database?.close();this.database=undefined;this.feedbackDatabase=undefined}
  private feedbackDb(){
    const db=this.db()
    if(this.feedbackDatabase!==db){db.exec('CREATE TABLE IF NOT EXISTS retrieval_contexts (id TEXT PRIMARY KEY,run_id TEXT NOT NULL,component_key TEXT NOT NULL,name TEXT NOT NULL,query_text TEXT NOT NULL,asset_sha256 TEXT NOT NULL,search_text TEXT NOT NULL,context_json TEXT NOT NULL,bytes INTEGER NOT NULL,UNIQUE(run_id,component_key)); CREATE TABLE IF NOT EXISTS retrieval_feedback (sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,case_id TEXT NOT NULL REFERENCES retrieval_contexts(id),record_json TEXT NOT NULL,record_sha256 TEXT NOT NULL,request_json TEXT NOT NULL,bytes INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS retrieval_feedback_case ON retrieval_feedback(case_id,sequence);');this.feedbackDatabase=db}
    return db
  }
  feedbackReceipt(runId:string,input:FeedbackInput){
    const row=this.feedbackDb().prepare('SELECT f.*,c.run_id FROM retrieval_feedback f JOIN retrieval_contexts c ON c.id=f.case_id WHERE f.id=?').get(input.id)
    if(!row)return undefined
    if(row.run_id!==runId||row.request_json!==feedbackCanonicalJson(input))throw new ComponentLibraryError(409,'反馈请求标识已用于其他内容，请重新读取后提交')
    const packet=this.readFeedbackCase(String(row.case_id)),latest=packet.revisions.at(-1)!.record
    return{...feedbackRevision(row),latestId:latest.id,duplicate:true}
  }
  feedbackContext(runId:string,componentKey:string){const row=this.feedbackDb().prepare('SELECT id FROM retrieval_contexts WHERE run_id=? AND component_key=?').get(runId,componentKey);return row?this.readFeedbackCase(String(row.id)):undefined}
  readFeedbackCase(id:string,upTo=Number.MAX_SAFE_INTEGER){
    if(!snapshotIdSchema.safeParse(id).success)throw new ComponentLibraryError(400,'素材反馈样本标识无效')
    const row=this.feedbackDb().prepare('SELECT * FROM retrieval_contexts WHERE id=?').get(id);if(!row)throw new ComponentLibraryError(404,'素材反馈样本不存在')
    try{
      const context=feedbackContextSchema.parse(JSON.parse(String(row.context_json)))
      if(sha(feedbackCanonicalJson(context))!==id||sha(componentSnapshotJson(context.asset))!==context.assetSha256||context.runId!==row.run_id||context.componentKey!==row.component_key||context.assetSha256!==row.asset_sha256||context.referenceImage&&sha(Buffer.from(context.referenceImage.dataUrl.split(',')[1]!,'base64'))!==context.referenceImage.sha256)throw new Error('hash')
      const revisions=this.feedbackDb().prepare('SELECT * FROM retrieval_feedback WHERE case_id=? AND sequence<=? ORDER BY sequence').all(id,upTo).map(feedbackRevision)
      let previous:string|null=null;for(const revision of revisions){if(revision.record.caseId!==id||revision.record.previousId!==previous)throw new Error('chain');previous=revision.record.id}
      return feedbackCaseSchema.parse({format:'fastfigure.retrieval-feedback',version:1,id,context,revisions})
    }catch{throw new ComponentLibraryError(503,'素材反馈上下文或改判记录与指纹不符，请核对备份')}
  }
  recordFeedback(contextInput:FeedbackContext,inputValue:unknown){
    const parsed=feedbackInputSchema.safeParse(inputValue);if(!parsed.success)throw new ComponentLibraryError(400,'请选择素材适用性，说明最多 1000 字')
    const input=parsed.data,context=feedbackContextSchema.parse(contextInput)
    if(input.componentKey!==context.componentKey||sha(componentSnapshotJson(context.asset))!==context.assetSha256||context.referenceImage&&sha(Buffer.from(context.referenceImage.dataUrl.split(',')[1]!,'base64'))!==context.referenceImage.sha256)throw new ComponentLibraryError(400,'反馈素材与冻结内容不符')
    const text=feedbackCanonicalJson(context),caseId=sha(text),contextBytes=Buffer.byteLength(text)
    if(contextBytes>2_400_000)throw new ComponentLibraryError(413,'反馈上下文超过 2.4 MB，未截断保存')
    const db=this.feedbackDb();db.exec('BEGIN IMMEDIATE')
    try{
      const duplicate=this.feedbackReceipt(context.runId,input);if(duplicate){db.exec('COMMIT');return duplicate}
      const existing=db.prepare('SELECT id FROM retrieval_contexts WHERE run_id=? AND component_key=?').get(context.runId,context.componentKey)
      if(existing&&existing.id!==caseId)throw new ComponentLibraryError(409,'本轮反馈上下文不能替换，请重新读取原样本')
      if(existing)this.readFeedbackCase(caseId)
      const previous=db.prepare('SELECT id FROM retrieval_feedback WHERE case_id=? ORDER BY sequence DESC LIMIT 1').get(caseId)
      if((previous?String(previous.id):null)!==input.previousId)throw new ComponentLibraryError(409,'反馈已有更新，请重新读取后再改判')
      const count=Number(db.prepare('SELECT COUNT(*) AS count FROM retrieval_feedback WHERE case_id=?').get(caseId)!.count)
      if(count>=100)throw new ComponentLibraryError(409,'这个样本已达到 100 次判断记录，请先导出核对')
      const record=feedbackRecordSchema.parse({id:input.id,caseId,createdAt:new Date().toISOString(),rating:input.rating,note:input.note,previousId:input.previousId}),recordJson=feedbackCanonicalJson(record),requestJson=feedbackCanonicalJson(input),recordBytes=Buffer.byteLength(recordJson)+Buffer.byteLength(requestJson),recordSha=sha(recordJson)
      const totals=db.prepare('SELECT (SELECT COUNT(*) FROM retrieval_contexts) AS cases,(SELECT COUNT(*) FROM retrieval_feedback) AS reviews,(SELECT COALESCE(SUM(bytes),0) FROM retrieval_contexts)+(SELECT COALESCE(SUM(bytes),0) FROM retrieval_feedback) AS bytes').get()!
      if(!existing&&Number(totals.cases)>=1000||Number(totals.reviews)>=5000||Number(totals.bytes)+(existing?0:contextBytes)+recordBytes>300_000_000)throw new ComponentLibraryError(409,'本机反馈集已达到容量限制，请先导出并备份')
      if(!existing)db.prepare('INSERT INTO retrieval_contexts(id,run_id,component_key,name,query_text,asset_sha256,search_text,context_json,bytes) VALUES (?,?,?,?,?,?,?,?,?)').run(caseId,context.runId,context.componentKey,context.asset.name,context.report.query,context.assetSha256,`${context.asset.name} ${context.report.query}`.toLowerCase(),text,contextBytes)
      db.prepare('INSERT INTO retrieval_feedback(id,case_id,record_json,record_sha256,request_json,bytes) VALUES (?,?,?,?,?,?)').run(record.id,caseId,recordJson,recordSha,requestJson,recordBytes)
      db.exec('COMMIT');return{record,sha256:recordSha,latestId:record.id,duplicate:false}
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  listFeedback(input:unknown){
    const query=feedbackFilter(input),db=this.feedbackDb(),total=Number(db.prepare(`SELECT COUNT(*) AS count ${latestFeedback}${query.where}`).get(...query.parameters)!.count)
    const records=db.prepare(`SELECT c.*,f.record_json,f.record_sha256 ${latestFeedback}${query.where} ORDER BY f.sequence DESC LIMIT ? OFFSET ?`).all(...query.parameters,query.limit,query.offset).map(row=>({caseId:String(row.id),runId:String(row.run_id),componentKey:String(row.component_key),name:String(row.name),query:String(row.query_text).slice(0,160),assetSha256:String(row.asset_sha256),latest:feedbackRevision(row).record}))
    return{records,total,offset:query.offset,limit:query.limit}
  }
  feedbackExport(input:unknown){
    const query=feedbackFilter(input),db=this.feedbackDb();db.exec('BEGIN')
    try{const sequence=Number(db.prepare('SELECT COALESCE(MAX(sequence),0) AS sequence FROM retrieval_feedback').get()!.sequence),ids=db.prepare(`SELECT c.id ${latestFeedback}${query.where} ORDER BY f.sequence DESC`).all(...query.parameters).map(row=>String(row.id));db.exec('COMMIT');return{sequence,ids}}catch(error){db.exec('ROLLBACK');throw error}
  }
  status(){const row=this.db().prepare(`SELECT COUNT(*) AS count, COUNT(a.snapshot_id) AS archived, COALESCE(SUM(s.bytes),0) AS bytes ${snapshots}`).get()!;return{directory:this.directory,count:Number(row.count),activeCount:Number(row.count)-Number(row.archived),archivedCount:Number(row.archived),bytes:Number(row.bytes),...this.limits}}
  list(input:unknown){
    const parsed=querySchema.safeParse(input);if(!parsed.success)throw new ComponentLibraryError(400,'检索参数无效，最多八个词、每页 24 项')
    const {q,offset,limit,scope}=parsed.data,terms=q.toLowerCase().split(/\s+/).filter(Boolean),conditions=[...(scope==='all'?[]:[`a.snapshot_id IS ${scope==='active'?'NULL':'NOT NULL'}`]),...terms.map(()=> 'instr(s.search_text, ?) > 0')],where=conditions.length?` WHERE ${conditions.join(' AND ')}`:''
    const db=this.db(),total=Number(db.prepare(`SELECT COUNT(*) AS total ${snapshots}${where}`).get(...terms)!.total)
    const records=db.prepare(`SELECT s.metadata_json,a.archived_at ${snapshots}${where} ORDER BY s.saved_at DESC,s.id LIMIT ? OFFSET ?`).all(...terms,limit,offset).map(row=>recordJson(row.metadata_json,row.archived_at))
    return{records,total,offset,limit,scope}
  }
  read(id:string){
    if(!snapshotIdSchema.safeParse(id).success)throw new ComponentLibraryError(400,'素材快照标识无效')
    const row=this.db().prepare(`SELECT s.asset_json,s.metadata_json,a.archived_at ${snapshots} WHERE s.id=?`).get(id);if(!row)throw new ComponentLibraryError(404,'本机素材快照不存在')
    try{const asset=parseAsset(JSON.parse(String(row.asset_json))),record=recordJson(row.metadata_json,row.archived_at);if(record.id!==id||sha(componentSnapshotJson(asset))!==id)throw new Error('hash');return{asset,record}}catch{throw new ComponentLibraryError(503,'素材内容与指纹不符，请保留素材库文件并检查备份')}
  }
  setState(id:string,input:unknown){
    if(!snapshotIdSchema.safeParse(id).success)throw new ComponentLibraryError(400,'素材快照标识无效')
    const parsed=snapshotStateInputSchema.safeParse(input);if(!parsed.success)throw new ComponentLibraryError(400,'请明确选择归档或恢复素材')
    const db=this.db();db.exec('BEGIN IMMEDIATE')
    try{
      const current=this.read(id).record
      if(parsed.data.archived&&!current.archivedAt)db.prepare('INSERT INTO snapshot_archives(snapshot_id,archived_at) VALUES (?,?)').run(id,new Date().toISOString())
      else if(!parsed.data.archived&&current.archivedAt)db.prepare('DELETE FROM snapshot_archives WHERE snapshot_id=?').run(id)
      const record=this.read(id).record;db.exec('COMMIT');return{record}
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  recommend(query:string,limit=6){
    if(typeof query!=='string'||query.length>14_000)throw new ComponentLibraryError(400,'素材检索文本不能超过 14000 字')
    if(!Number.isInteger(limit)||limit<1||limit>24)throw new ComponentLibraryError(400,'素材召回候选数须为 1 至 24')
    const queryTerms=repositoryRecallTerms(query),{groups}=queryTerms
    if(!groups.length)return{...queryTerms,candidatePoolCapped:false,matches:[]}
    const rough=groups.map(group=>`(${group.terms.map(()=>'(instr(s.search_text,?)>0)').join(' OR ')})`).join('+'),parameters=groups.flatMap(group=>group.terms),rows=this.db().prepare(`SELECT s.metadata_json,(${rough}) AS rough ${snapshots} WHERE a.snapshot_id IS NULL AND (${rough})>0 ORDER BY rough DESC,s.saved_at DESC,s.id LIMIT 25`).all(...parameters,...parameters)
    const matches=rows.slice(0,24).map(row=>{const record=recordJson(row.metadata_json);return{record,...scoreComponentMetadata(record,groups)}}).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||b.record.savedAt.localeCompare(a.record.savedAt)||a.record.id.localeCompare(b.record.id)).slice(0,limit)
    return{...queryTerms,candidatePoolCapped:rows.length>24,matches}
  }
  contentMatches(input:unknown){
    const parsed=contentMatchInputSchema.safeParse(input);if(!parsed.success)throw new ComponentLibraryError(400,'请选择有效组件再检查相同图形')
    const asset=parsed.data.asset,text=componentSnapshotJson(asset);if(Buffer.byteLength(text)>2_000_000)throw new ComponentLibraryError(413,'组件不能超过 2 MB')
    const assetSha256=sha(text),contentSha256=sha(componentContentJson(asset)),db=this.db()
    // Derived index only. Backfill bounded chunks so existing large libraries can
    // report progress and pause without changing a single immutable snapshot.
    db.exec('BEGIN IMMEDIATE')
    try{
      const missing=db.prepare('SELECT s.id FROM snapshots s LEFT JOIN snapshot_content c ON c.snapshot_id=s.id AND c.algorithm=? WHERE c.snapshot_id IS NULL OR c.error=1 ORDER BY CASE WHEN c.snapshot_id IS NULL THEN 0 ELSE 1 END,s.saved_at DESC,s.id LIMIT 16').all(componentContentAlgorithm)
      const put=db.prepare('INSERT OR REPLACE INTO snapshot_content(snapshot_id,algorithm,content_hash,error) VALUES (?,?,?,?)')
      for(const row of missing){try{put.run(String(row.id),componentContentAlgorithm,sha(componentContentJson(this.read(String(row.id)).asset)),0)}catch(error){if(!(error instanceof ComponentLibraryError)||error.status!==503)throw error;put.run(String(row.id),componentContentAlgorithm,null,1)}}
      db.exec('COMMIT')
    }catch(error){db.exec('ROLLBACK');throw error}
    const candidates=db.prepare('SELECT c.snapshot_id FROM snapshot_content c JOIN snapshots s ON s.id=c.snapshot_id WHERE c.algorithm=? AND c.content_hash=? AND c.snapshot_id<>? ORDER BY s.saved_at DESC,c.snapshot_id LIMIT 12').all(componentContentAlgorithm,contentSha256,assetSha256),records:ComponentSnapshot[]=[]
    for(const row of candidates){try{const packet=this.read(String(row.snapshot_id));const verified=sha(componentContentJson(packet.asset));if(verified!==contentSha256){db.prepare('UPDATE snapshot_content SET content_hash=?,error=0 WHERE snapshot_id=?').run(verified,String(row.snapshot_id));continue}if(records.length<6)records.push(packet.record)}catch(error){if(!(error instanceof ComponentLibraryError)||error.status!==503)throw error;db.prepare('UPDATE snapshot_content SET content_hash=NULL,error=1 WHERE snapshot_id=?').run(String(row.snapshot_id))}}
    const total=Number(db.prepare('SELECT COUNT(*) AS total FROM snapshot_content WHERE algorithm=? AND content_hash=? AND snapshot_id<>?').get(componentContentAlgorithm,contentSha256,assetSha256)!.total)
    const index=db.prepare('SELECT COUNT(*) AS total,SUM(CASE WHEN c.snapshot_id IS NULL THEN 1 ELSE 0 END) AS remaining,SUM(COALESCE(c.error,0)) AS unreadable FROM snapshots s LEFT JOIN snapshot_content c ON c.snapshot_id=s.id AND c.algorithm=?').get(componentContentAlgorithm)!
    return{algorithm:componentContentAlgorithm,checkedAt:new Date().toISOString(),assetSha256,contentSha256,records,total,index:{total:Number(index.total),remaining:Number(index.remaining??0),unreadable:Number(index.unreadable??0)}}
  }
  publish(input:unknown){
    const parsed=publishComponentSchema.safeParse(input);if(!parsed.success)throw new ComponentLibraryError(400,'请选择有效的组件快照与预览，当前素材库未改变')
    for(const source of parsed.data.asset.sources)if(source.collection&&sha(collectionSelectionJson(source.collection))!==source.collection.selectionSha256)throw new ComponentLibraryError(400,'采集选择指纹与来源记录不符')
    const {asset,thumbnail}=parsed.data,text=componentSnapshotJson(asset),bytes=Buffer.byteLength(text),id=sha(text),root=rootContainer(asset.figure)
    if(bytes>2_000_000)throw new ComponentLibraryError(413,'单个组件快照不能超过 2 MB')
    if(thumbnail){
      if(thumbnail.assetSha256!==id)throw new ComponentLibraryError(400,'缩略图不属于当前组件快照，请重新生成预览')
      try{const size=rasterDimensions(thumbnail.dataUrl);if(size.width<1||size.height<1||size.width>640||size.height>480)throw new Error('size')}catch{throw new ComponentLibraryError(400,'组件缩略图须为不超过 640×480 的 PNG 或 WebP')}
    }
    const record:ComponentSnapshot=componentSnapshotSchema.parse({id,assetId:asset.id,name:asset.name,description:asset.description,tags:asset.tags,savedAt:new Date().toISOString(),revision:asset.updatedAt,bytes,width:root.width,height:root.height,nodes:asset.figure.nodes.length,edges:asset.figure.edges.length,sources:asset.sources.map(({title,reference})=>({title,reference})),...(thumbnail?{thumbnail:thumbnail.dataUrl}:{})})
    const db=this.db();db.exec('BEGIN IMMEDIATE')
    try{
      const previous=db.prepare('SELECT metadata_json FROM snapshots WHERE id=?').get(id)
      if(previous){const original=this.read(id).record;db.exec('COMMIT');return{record:original,duplicate:true}}
      const status=this.status();if(status.count>=this.limits.maxEntries||status.bytes+bytes>this.limits.maxBytes)throw new ComponentLibraryError(409,'本机素材库已达到容量限制；归档不释放存储，请先备份或更换存储目录')
      const search=[id,asset.id,asset.name,asset.description,...asset.tags,...asset.sources.flatMap(s=>[s.title,s.reference])].join(' ').toLowerCase()
      db.prepare('INSERT INTO snapshots(id,asset_json,metadata_json,search_text,saved_at,bytes) VALUES (?,?,?,?,?,?)').run(id,text,JSON.stringify(record),search,record.savedAt,bytes)
      db.prepare('INSERT INTO snapshot_content(snapshot_id,algorithm,content_hash,error) VALUES (?,?,?,0)').run(id,componentContentAlgorithm,sha(componentContentJson(asset)))
      db.exec('COMMIT');return{record,duplicate:false}
    }catch(error){db.exec('ROLLBACK');throw error}
  }
}
