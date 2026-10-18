/** Serializes one document's optimistic saves; disposal isolates later editor instances. */
import type { ResumeSnapshot, SaveRequest } from '../types.ts'
export type SaveFailure = Error & { code?: string; currentRevision?: number }
export interface DraftState { snapshot: ResumeSnapshot; draft: string; dirty: boolean; saving: boolean; error: SaveFailure | null }
export class SaveCoordinator {
  readonly state: DraftState
  private running: Promise<void> | null = null
  private active = true
  private requests: {versionName?:string;sessionId?:string}[] = []
  /** Acknowledgement cleanup receives the exact submitted JSON, before Host normalization.
   * Cleanup must contain/report its own storage errors; it runs even if this editor closes during save.
   */
  constructor(snapshot: ResumeSnapshot, private readonly save: (request: SaveRequest)=>Promise<ResumeSnapshot>, private readonly changed: ()=>void = ()=>{}, private readonly acknowledged:(saved:ResumeSnapshot,submittedJson:string)=>Promise<void> = async()=>{}) {
    this.state={snapshot,draft:snapshot.documentJson,dirty:false,saving:false,error:null}
  }
  edit(json: string): void { this.state.draft=json;this.state.dirty=json!==this.state.snapshot.documentJson;this.changed() }
  receive(snapshot: ResumeSnapshot): boolean {
    if(snapshot.id!==this.state.snapshot.id||snapshot.revision<=this.state.snapshot.revision)return false
    if(this.state.dirty||this.state.saving){ this.state.error=Object.assign(new Error('A newer revision exists. Reload it or save your draft as a copy.'),{code:'conflict'});this.changed();return false }
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
      const sent=this.state.draft
      this.state.saving=true;this.changed()
      try {
        const saved=await this.save({id:this.state.snapshot.id,expectedRevision:this.state.snapshot.revision,documentJson:sent,versionName,sessionId})
        if(saved.id!==this.state.snapshot.id||saved.revision!==this.state.snapshot.revision+1)throw Error('Invalid save acknowledgement')
        if(this.active){this.state.snapshot=saved;this.state.dirty=this.state.draft!==sent;if(!this.state.dirty)this.state.draft=saved.documentJson}
        await this.acknowledged(saved,sent)
        if(!this.active)return
      }catch(error){this.state.error=error instanceof Error?error:Error('Save failed');throw error}
      finally{this.state.saving=false;if(this.active)this.changed()}
    }
  }
  retry(): void { if(this.state.error?.code!=='conflict')this.state.error=null;this.changed() }
  dispose(): void { this.active=false }
}
