/** Test-only source worker: races a real independent process against a shared envelope. */
import { ResumeStore, resolveConfig } from '../../src/host/store.ts'
const store=new ResumeStore(resolveConfig(process.argv[2],{storageDir:process.argv[2]}))
const snapshot=await store.read(process.argv[3])
process.send?.('ready')
process.once('message',async()=>{
 try{await store.save({id:snapshot.id,expectedRevision:snapshot.revision,documentJson:snapshot.documentJson});process.send?.('saved')}
 catch(error){process.send?.(error instanceof Error&&'code'in error?String(error.code):'unexpected')}
 process.disconnect()
})
