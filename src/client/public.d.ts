/** Browser plugin loading surface; the browser bundle is loaded by Harness ModuleLoader. */
import type { Context } from '@deepseek-ai/cordis'
/** Required Client services. */
export declare const inject: string[]
/** Register the isolated resume editor and renderer; releases resources on Context disposal.
 * @param ctx - Harness Client context.
 * @returns completion of generated Remote mounting and UI registrations.
 */
export declare function apply(ctx:Context):Promise<void>
