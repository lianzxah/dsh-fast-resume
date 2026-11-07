/** Serializes one document's optimistic saves; disposal isolates later editor instances. */
import type { ResumeSnapshot, SaveRequest } from '../types.ts'
export type SaveFailure = Error & { code?: string; currentRevision?: number }
export interface DraftState { snapshot: ResumeSnapshot; draft: string; dirty: boolean; saving: boolean; error: SaveFailure | null; recoveryError: SaveFailure | null }
export class SaveCoordinator {
  readonly state: DraftState
  private running: Promise<void> | null = null
  private active = true
  private backups=new Set<Promise<unknown>>()
  private backupSequence=0
  private settledBackupSequence=0
  private generation=0
  /** Track recovery writes by submission order; older completions cannot replace newer recovery status. */
  trackBackup(pending:Promise<unknown>):void{
    const sequence=++this.backupSequence
    const settle=(error:SaveFailure|null)=>{if(sequence>=this.settledBackupSequence){this.settledBackupSequence=sequence;this.state.recoveryError=error;if(this.active)this.changed()}}
    const tracked=pending.then(()=>settle(null),error=>settle(error instanceof Error?error:Error('Recovery write failed')))
    this.backups.add(tracked);void tracked.then(()=>this.backups.delete(tracked))
  }
  private async drainBackups():Promise<void>{while(this.backups.size)await Promise.all(this.backups)}
  /** Flush after gestures are fenced; unresolved recovery failures block AI preparation, not acknowledged manual saves. */
  async prepare():Promise<ResumeSnapshot>{const generation=this.generation;await this.drainBackups();if(this.state.recoveryError)throw this.state.recoveryError;await this.flush();await this.drainBackups();if(this.state.recoveryError)throw this.state.recoveryError;if(!this.active||this.generation!==generation||this.state.dirty||this.state.saving||this.state.error)throw Error('Editor changed during preparation');return this.state.snapshot}
  private requests: {versionName?:string;sessionId?:string}[] = []
  /** Acknowledgement cleanup receives the exact submitted JSON, before Host normalization.
   * Cleanup must contain/report its own storage errors; it runs even if this editor closes during save.
   */
  constructor(snapshot: ResumeSnapshot, private readonly save: (request: SaveRequest)=>Promise<ResumeSnapshot>, private readonly changed: ()=>void = ()=>{}, private readonly acknowledged:(saved:ResumeSnapshot,submittedJson:string)=>Promise<void> = async()=>{}) {
    this.state={snapshot,draft:snapshot.documentJson,dirty:false,saving:false,error:null,recoveryError:null}
  }
  edit(json: string): void { this.generation++;this.state.draft=json;this.state.dirty=json!==this.state.snapshot.documentJson;this.changed() }
  /** Install acknowledged content synchronously before advancing the saved revision; failed installation retains the draft.
   * @param snapshot Incoming Host acknowledgement.
   * @param install Atomic content installation; must validate before mutating the editor store.
   * @returns Whether the acknowledgement was installed; rejected content retains a visible error.
   */
  receive(snapshot: ResumeSnapshot, install:()=>void = ()=>{}): boolean {
    if(snapshot.id!==this.state.snapshot.id||snapshot.revision<=this.state.snapshot.revision)return false
    if(this.state.dirty||this.state.saving){ this.state.error=Object.assign(new Error('A newer revision exists. Reload it or save your draft as a copy.'),{code:'conflict'});this.changed();return false }
    try{install()}catch(error){this.state.error=error instanceof Error?error:Error('Incoming revision could not be installed');this.changed();return false}
    this.state.snapshot=snapshot;this.state.draft=snapshot.documentJson;this.changed();return true
  }
  flush(versionName?: string, sessionId?: string): Promise<void> {
    if(versionName!==undefined||sessionId!==undefined)this.requests.push({versionName,sessionId})
    if(this.running)return this.running
    if(this.state.error)return Promise.reject(this.state.error)
    this.running=this.drain().finally(()=>{this.running=null})
    return this.running
  }
  private async drain(): Promise<void> {
    while(this.active&&(this.state.dirty||this.requests.length>0)){
      const {versionName,sessionId}=this.requests.shift()??{}
      const sent=this.state.draft,generation=this.generation
      this.state.saving=true;this.changed()
      try {
        const saved=await this.save({id:this.state.snapshot.id,expectedRevision:this.state.snapshot.revision,documentJson:sent,versionName,sessionId})
        if(saved.id!==this.state.snapshot.id||saved.revision!==this.state.snapshot.revision+1)throw Error('Invalid save acknowledgement')
        if(this.active){this.state.snapshot=saved;this.state.dirty=this.state.draft!==sent;if(!this.state.dirty)this.state.draft=saved.documentJson}
        await this.drainBackups()
        await this.acknowledged(saved,sent)
        if(this.generation===generation){this.settledBackupSequence=this.backupSequence;this.state.recoveryError=null}
        if(!this.active)return
      }catch(error){this.state.error=error instanceof Error?error:Error('Save failed');throw error}
      finally{this.state.saving=false;if(this.active)this.changed()}
    }
  }
  retry(): void { if(this.state.error?.code!=='conflict')this.state.error=null;this.changed() }
  dispose(): void { this.active=false }
}
