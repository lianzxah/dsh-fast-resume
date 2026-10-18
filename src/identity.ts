/** Branded document identities admitted at JSON, routing and persistence parsers. */
import {z} from 'zod'
import {brandString,brandNumber} from '@deepseek-ai/dsh-brand'
import type {ResumeId,ResumeRevision,ResumeVersionId,ResumeProposalId} from './types.ts'
/** A document identity admitted by transport validation; the Host additionally checks its filename form. */
export const resumeIdSchema=z.string().min(1).max(256).transform(brandString<ResumeId>)
/** A positive safe committed document revision. */
export const resumeRevisionSchema=z.number().int().positive().safe().transform(brandNumber<ResumeRevision>)
/** Retained version identity. */
export const versionIdSchema=z.string().min(1).max(256).transform(brandString<ResumeVersionId>)
/** Durable proposal identity. */
export const proposalIdSchema=z.string().min(1).max(256).transform(brandString<ResumeProposalId>)
