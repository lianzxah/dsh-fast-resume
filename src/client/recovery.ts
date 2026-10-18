/** Parent-owned recovery records keep each editor's draft independently. */
import {recoverySchema,type Recovery} from '../protocol.ts'
/** Exact submitted-draft matching protects a newer parent-owned recovery record.
 * @param recovery Current parent-owned draft.
 * @param revision Acknowledged committed revision.
 * @param submittedJson Exact JSON submitted by the acknowledged save.
 * @returns Whether the saved revision acknowledges this draft.
 */
export function matchesAcknowledgedDraft(recovery:Recovery|null,revision:number,submittedJson:string):boolean{return recovery!==null&&recovery.revision<=revision&&recovery.documentJson===submittedJson}
/** One storage seat shared by tabs; each record has an independent editor owner and local sequence. */
export class RecoveryStore {
 constructor(private storage:Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>){}
 private key(id:string,ownerId:string,editorId:string){return ownerId==='legacy'?`fast-resume:recovery:v1:${id}`:`fast-resume:recovery:v2:${encodeURIComponent(id)}:${encodeURIComponent(ownerId)}:${encodeURIComponent(editorId)}`}
 /** Load all retained drafts, newest first, including a pre-owner recovery record.
  * @param id Resume identity.
  * @returns Independent editor drafts; malformed persisted data rejects the read.
  */
 list(id:string):Recovery[]{
  const found:Recovery[]=[],prefix=`fast-resume:recovery:v2:${encodeURIComponent(id)}:`
  for(let index=0;index<this.storage.length;index++){const key=this.storage.key(index);if(!key?.startsWith(prefix))continue;const json=this.storage.getItem(key);if(json===null)continue;const record=recoverySchema.parse(JSON.parse(json));if(record.id!==id||this.key(id,record.ownerId,record.editorId)!==key)throw Error('Recovery draft identity differs from its storage key');found.push(record)}
  const legacy=this.storage.getItem(this.key(id,'legacy','legacy'))
  if(legacy!==null){const record=recoverySchema.omit({ownerId:true,editorId:true,localRevision:true}).parse(JSON.parse(legacy));if(record.id!==id)throw Error('Recovery draft identity differs from its storage key');found.push({...record,ownerId:'legacy',editorId:'legacy',localRevision:1})}
  return found.sort((a,b)=>b.updatedAt-a.updatedAt||a.ownerId.localeCompare(b.ownerId))
 }
 /** Persist only a newer local sequence for this editor.
  * @param record Independently owned draft.
  * @returns Whether this sequence was stored.
  */
 write(record:Recovery):boolean{const key=this.key(record.id,record.ownerId,record.editorId),previous=this.storage.getItem(key);if(previous!==null&&recoverySchema.parse(JSON.parse(previous)).localRevision>=record.localRevision)return false;this.storage.setItem(key,JSON.stringify(record));return true}
 /** Remove only the exact selected owner/sequence acknowledged by a save or explicit discard.
  * @param record Exact observed recovery identity and JSON.
  * @param revision Acknowledged or explicitly discarded base revision.
  * @returns Whether the selected record was removed.
  */
 remove(record:Recovery,revision:number):boolean{const current=this.list(record.id).find(item=>item.ownerId===record.ownerId&&item.editorId===record.editorId);if(!current||current.localRevision!==record.localRevision||!matchesAcknowledgedDraft(current,revision,record.documentJson))return false;this.storage.removeItem(this.key(record.id,record.ownerId,record.editorId));return true}
}
