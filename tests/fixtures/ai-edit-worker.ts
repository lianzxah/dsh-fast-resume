/** IPC barrier places separate AI writers at the same model-read revision. */
import {ResumeStore,resolveConfig} from '../../src/host/store.ts'
import {EditorCoordinator} from '../../src/host/editor-coordinator.ts'
import {resumeIdSchema} from '../../src/identity.ts'
const [root,id]=process.argv.slice(2),store=new ResumeStore(resolveConfig(root,{storageDir:root})),coordinator=new EditorCoordinator(store),snapshot=await store.read(resumeIdSchema.parse(id))
process.once('message',async()=>{try{const permit=await coordinator.prepare({resumeId:snapshot.id,expectedRevision:snapshot.revision,mutationId:String(process.pid)});try{await store.edit({id:snapshot.id,expectedRevision:snapshot.revision,requestId:String(process.pid),summary:'Two-process edit',operationsJson:JSON.stringify([{type:'template.apply',templateId:'template-modern'}])},undefined,permit.guard);process.send?.('committed')}finally{await permit.release()}}catch(error){process.send?.(error instanceof Error&&'code' in error?error.code:'unexpected')}finally{await coordinator.dispose();process.disconnect()}})
process.send?.('ready')
