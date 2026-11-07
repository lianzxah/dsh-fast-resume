/** Service-owned requests outlive admission shutdown through their final result and durable writes. */
import {ResumeError} from './errors.ts'

/** Tracks accepted requests separately from callbacks required to finish them. */
export class OperationLifetime {
 private phase:'open'|'closing'|'closed'='open'
 private readonly pending=new Set<Promise<unknown>>()
 /** Admit and retain one complete operation, including error/result construction.
  * @param operation Work whose dependencies remain usable throughout service shutdown.
  * @param completion Whether this callback can finish an already accepted operation during closing.
  * @returns The actual operation outcome; shutdown never substitutes a rollback result.
  */
 async run<T>(operation:()=>T|Promise<T>,completion=false):Promise<T>{
  if(this.phase==='closed'||this.phase==='closing'&&!completion)throw new ResumeError('disposed','Resume service has stopped accepting operations')
  const pending=Promise.resolve().then(operation)
  this.pending.add(pending)
  try{return await pending}finally{this.pending.delete(pending)}
 }
 /** Close admissions, cancel preadmission waits, then settle every accepted operation and completion callback.
  * @param cancel Cancellation/settlement owners; each runs even when another cleanup fails. They must retain writers and completion methods.
  * @returns Quiescence, rejecting with cleanup errors only after all work settles.
  */
 async close(cancel:Array<()=>void|Promise<void>>):Promise<void>{
  this.phase='closing'
  const outcomes=await Promise.allSettled(cancel.map(cleanup=>Promise.resolve().then(cleanup)))
  while(this.pending.size)await Promise.allSettled([...this.pending])
  this.phase='closed'
  const errors=outcomes.flatMap(outcome=>outcome.status==='rejected'?[outcome.reason]:[])
  if(errors.length)throw new AggregateError(errors,'Resume service cleanup failed after operation settlement')
 }
}
