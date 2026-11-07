vi.mock('@resume-editor/canvas-engine',()=>({alignBoxes:vi.fn(),distributeBoxes:vi.fn()}))
import {beforeEach,expect,it,vi} from 'vitest'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
import {createTextElement} from '../../upstream/canvas-engine/src/element-factory.ts'
import {newDocument} from '../../src/host/operations.ts'
import {resumeIdSchema,resumeRevisionSchema} from '../../src/identity.ts'
import {captureEditorCheckpoint,restoreEditorCheckpoint,installCommittedRevision} from '../../src/editor/editor-checkpoint.ts'
const limit=67_108_864
function snapshot(revision=1){const document=useEditorStore.getState().document;return {id:resumeIdSchema.parse(document.id),revision:resumeRevisionSchema.parse(revision),title:document.metadata.title,pageCount:document.pages.length,updatedAt:document.metadata.updatedAt,documentJson:JSON.stringify(document)}}
beforeEach(()=>{useEditorStore.setState(useEditorStore.getInitialState(),true);useEditorStore.getState().setDocument(newDocument('Checkpoint'))})
it('preserves real undo/redo stacks, history, page, viewport, clipboard and preferences at the same revision',()=>{
 const s=useEditorStore.getState();s.addPage();s.applyDocumentTransform(d=>({...d,metadata:{...d.metadata,title:'Edit'}}));s.undo();s.setActivePage(1);s.setZoom(.7);s.toggleRightPanel();s.markClean()
 const saved=snapshot(),checkpoint=captureEditorCheckpoint(saved,limit),before=useEditorStore.getState();s.setDocument(newDocument('Replacement'));restoreEditorCheckpoint(checkpoint,saved,limit)
 const after=useEditorStore.getState();for(const field of ['past','future','history','historyIndex','activePageIndex','selection','viewport','clipboard','ui','fitMode'] as const)expect(after[field]).toEqual(before[field])
 after.redo();expect(useEditorStore.getState().document.metadata.title).toBe('Edit');useEditorStore.getState().undo();expect(useEditorStore.getState().document.metadata.title).toBe('Checkpoint')
})
it('adds one clean undo entry for a committed batch and ignores duplicate receipts',()=>{
 const saved=snapshot(),next={...saved,revision:resumeRevisionSchema.parse(2),documentJson:JSON.stringify({...useEditorStore.getState().document,metadata:{...useEditorStore.getState().document.metadata,title:'AI'}})}
 expect(installCommittedRevision(next,{baseRevision:saved.revision,batchId:'batch-1'},saved)).toBe(true)
 const state=useEditorStore.getState();expect(state.past).toHaveLength(1);expect(state.future).toEqual([]);expect(state.isDirty).toBe(false)
 expect(installCommittedRevision(next,{baseRevision:saved.revision,batchId:'batch-1'},next)).toBe(false);expect(useEditorStore.getState().past).toHaveLength(1)
 state.undo();expect(useEditorStore.getState().document.metadata.title).toBe('Checkpoint');state.redo();expect(useEditorStore.getState().document.metadata.title).toBe('AI')
})
it('rejects dirty, mismatched, corrupt and oversized checkpoints without changing the store',()=>{
 const saved=snapshot(),checkpoint=captureEditorCheckpoint(saved,limit)
 for(const [value,target,budget] of [[checkpoint,{...saved,revision:resumeRevisionSchema.parse(2)},limit],[{...checkpoint,past:[{}]},saved,limit],[checkpoint,saved,8]] as const){const before=useEditorStore.getState();expect(()=>restoreEditorCheckpoint(value,target,budget)).toThrow();expect(useEditorStore.getState()).toBe(before)}
 useEditorStore.getState().markDirty();expect(()=>captureEditorCheckpoint(saved,limit)).toThrow();expect(()=>restoreEditorCheckpoint(checkpoint,saved,limit)).toThrow()
})
it('retains local drafts and history when an AI receipt arrives dirty or across a revision gap',()=>{
 const saved=snapshot(),next={...saved,revision:resumeRevisionSchema.parse(3)}
 const before=useEditorStore.getState();expect(()=>installCommittedRevision(next,{baseRevision:saved.revision,batchId:'gap'},saved)).toThrow();expect(useEditorStore.getState()).toBe(before)
 useEditorStore.getState().updateDocumentTitle('Local draft');const dirty=useEditorStore.getState();expect(()=>installCommittedRevision({...next,revision:resumeRevisionSchema.parse(2)},{baseRevision:saved.revision,batchId:'dirty'},saved)).toThrow();expect(useEditorStore.getState()).toBe(dirty)
})

it('keeps valid selection and clipboard independent of later source changes',()=>{
 const element=createTextElement({id:'selected',content:'Kept'}),other=createTextElement({id:'removed',content:'Removed'})
 const document=useEditorStore.getState().document
 useEditorStore.getState().setDocument({...document,pages:[{...document.pages[0],elements:[element,other]}]})
 useEditorStore.getState().selectMultiple([element.id,other.id]);useEditorStore.getState().copySelection()
 const saved=snapshot(),checkpoint=captureEditorCheckpoint(saved,limit)
 useEditorStore.setState({clipboard:[],selection:{selectedIds:[],hoveredId:null}})
 restoreEditorCheckpoint(checkpoint,saved,limit)
 expect(useEditorStore.getState().clipboard).toHaveLength(2);expect(useEditorStore.getState().selection.selectedIds).toEqual(['selected','removed'])
 const changed={...document,pages:[{...document.pages[0],elements:[element]}]}
 installCommittedRevision({...saved,revision:resumeRevisionSchema.parse(2),documentJson:JSON.stringify(changed)},{baseRevision:saved.revision,batchId:'delete'},saved)
 expect(useEditorStore.getState().selection.selectedIds).toEqual(['selected']);expect(checkpoint.selection.selectedIds).toEqual(['selected','removed'])
})
it('rejects changed checkpoint content and counts UTF-8 JSON bytes before serializing',()=>{
 const saved=snapshot(),checkpoint=captureEditorCheckpoint(saved,limit),before=useEditorStore.getState()
 expect(()=>restoreEditorCheckpoint({...checkpoint,document:{...checkpoint.document,metadata:{...checkpoint.document.metadata,title:'Tampered'}}},saved,limit)).toThrow('content does not match')
 expect(useEditorStore.getState()).toBe(before)
 const exact=new TextEncoder().encode(JSON.stringify(checkpoint)).length
 expect(()=>restoreEditorCheckpoint(checkpoint,saved,exact)).not.toThrow()
 expect(()=>restoreEditorCheckpoint(checkpoint,saved,exact-1)).toThrow('byte limit')
})
it('enforces the final byte budget when the Host expands a short saved timestamp',()=>{
 const document=useEditorStore.getState().document
 useEditorStore.getState().setDocument({...document,metadata:{...document.metadata,updatedAt:'x'}})
 const source=snapshot(),checkpoint=captureEditorCheckpoint(source,limit)
 const sourceBytes=new TextEncoder().encode(JSON.stringify(checkpoint)).length
 const updatedAt='2026-11-01T00:00:00.000Z',committed={...checkpoint.document,metadata:{...checkpoint.document.metadata,updatedAt}}
 const host={...source,updatedAt,documentJson:JSON.stringify(committed)},before=useEditorStore.getState()
 expect(()=>captureEditorCheckpoint(host,sourceBytes)).toThrow('byte limit')
 expect(()=>restoreEditorCheckpoint(checkpoint,host,sourceBytes)).toThrow('byte limit')
 expect(useEditorStore.getState()).toBe(before)
 const finalBytes=sourceBytes+updatedAt.length-1
 const normalized=captureEditorCheckpoint(host,finalBytes)
 expect(new TextEncoder().encode(JSON.stringify(normalized)).length).toBe(finalBytes)
 expect(()=>captureEditorCheckpoint(host,finalBytes-1)).toThrow('byte limit')
 expect(()=>restoreEditorCheckpoint(checkpoint,host,finalBytes)).not.toThrow()
 expect(useEditorStore.getState().document.metadata.updatedAt).toBe(updatedAt)
})
