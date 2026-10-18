/** Structured operational failures shared by tools and the authenticated gateway. */
export type ResumeFailureCode = 'invalid-input' | 'not-found' | 'conflict' | 'invalid-storage' | 'storage-failure' | 'renderer-unavailable' | 'render-timeout' | 'render-cancelled' | 'queue-full' | 'disposed'
/** A known failed operation; no receipt is emitted for these failures. */
export class ResumeError extends Error {
  constructor(readonly code: ResumeFailureCode, message: string, readonly currentRevision?: number) { super(message); this.name = 'ResumeError' }
}
/** Exhaust closed operation tags.
 * @param value Unreachable discriminant.
 * @returns Never returns.
 */
export function assertNever(value: never): never { throw new ResumeError('invalid-input', `Unsupported operation ${String(value)}`) }
