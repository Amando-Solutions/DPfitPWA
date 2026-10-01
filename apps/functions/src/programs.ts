// =============================================================================
// Versioning a published program.
//
// A published program is immutable: cohorts pin it by `programId` and
// `programVersion`, and a member's plan is read from exactly that version. So a
// change starts from a copy. `cloneProgramVersion` copies a published program,
// with its workout days, guides and weeks, into the next version as a draft the
// admin console can edit. Cohorts already pinned to the source stay on it.
//
// Ids are `{familyId}-v{n}`. `familyId` is stored on the program, or derived
// from the source id by dropping its `-v{n}`.
// =============================================================================
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, type CallableRequest } from 'firebase-functions/https'
import { DATABASES, database, type DatabaseId } from './databases.js'

/** One batch carries the copy, so it is held well under Firestore's 500 writes. */
const MAX_COPIED_DOCUMENTS = 200

const invalid = (message: string) => new HttpsError('invalid-argument', message)

const readDocumentId = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`\`${name}\` is required.`)
  const id = value.trim()
  if (id.includes('/')) throw invalid(`\`${name}\` must be a document id.`)
  return id
}

const readDatabaseId = (value: unknown): DatabaseId => {
  const id = value ?? '(default)'
  if (typeof id !== 'string' || !DATABASES.includes(id as DatabaseId)) {
    throw invalid(`\`database\` must be one of: ${DATABASES.join(', ')}.`)
  }
  return id as DatabaseId
}

const familyIdOf = (sourceId: string, value: unknown): string => {
  const stored = typeof value === 'string' ? value.trim() : ''
  return stored || sourceId.replace(/-v\d+$/i, '')
}

/**
 * Copy a published program into its next version, as a draft.
 *
 * Request data: `{ database?: '(default)' | 'staging', sourceProgramId: string }`.
 *
 * Refuses with `unauthenticated`, `permission-denied` (no `dpfitAdmin` claim),
 * `invalid-argument`, `not-found`, `failed-precondition` (the source is not
 * published), `already-exists` (the next version is already there) or
 * `resource-exhausted` (more child documents than one batch should carry).
 */
export const clonePublishedProgram = async (request: CallableRequest<unknown>) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to clone a program.')
  if (request.auth.token.dpfitAdmin !== true) {
    throw new HttpsError('permission-denied', 'Only a DP Fit admin can clone a program.')
  }

  const input = (request.data ?? {}) as Record<string, unknown>
  const databaseId = readDatabaseId(input.database)
  const sourceProgramId = readDocumentId(input.sourceProgramId, 'sourceProgramId')
  const db = database(databaseId)
  const sourceReference = db.doc(`programs/${sourceProgramId}`)
  const sourceSnapshot = await sourceReference.get()

  if (!sourceSnapshot.exists) {
    throw new HttpsError('not-found', `programs/${sourceProgramId} does not exist.`)
  }

  const source = sourceSnapshot.data() ?? {}
  if (source.status !== 'published') {
    throw new HttpsError('failed-precondition', 'Only a published program can be versioned.')
  }

  const sourceVersion = Number.isInteger(source.version) ? Number(source.version) : 1
  const nextVersion = sourceVersion + 1
  const familyId = familyIdOf(sourceProgramId, source.familyId)
  if (familyId.includes('/')) {
    throw new HttpsError('failed-precondition', 'The program family id is invalid.')
  }
  const targetProgramId = `${familyId}-v${nextVersion}`
  const targetReference = db.doc(`programs/${targetProgramId}`)
  const [targetSnapshot, workoutDays, guides, weeks] = await Promise.all([
    targetReference.get(),
    sourceReference.collection('workoutDays').get(),
    sourceReference.collection('guides').get(),
    sourceReference.collection('weeks').get(),
  ])

  if (targetSnapshot.exists) {
    throw new HttpsError(
      'already-exists',
      `Program version ${nextVersion} already exists as ${targetProgramId}.`,
    )
  }

  const copiedDocumentCount = workoutDays.size + guides.size + weeks.size
  if (copiedDocumentCount > MAX_COPIED_DOCUMENTS) {
    throw new HttpsError(
      'resource-exhausted',
      `This program has ${copiedDocumentCount} child documents; the safe copy limit is ${MAX_COPIED_DOCUMENTS}.`,
    )
  }

  const actorEmail = typeof request.auth.token.email === 'string' ? request.auth.token.email : ''
  const audit = {
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdByUid: request.auth.uid,
    createdByEmail: actorEmail,
    updatedByUid: request.auth.uid,
    updatedByEmail: actorEmail,
  }
  const batch = db.batch()
  batch.create(targetReference, {
    ...source,
    id: targetProgramId,
    familyId,
    sourceProgramId,
    version: nextVersion,
    status: 'draft',
    publishedAt: null,
    workoutDayCount: source.workoutDayCount ?? workoutDays.size,
    guideCount: guides.size,
    ...audit,
  })

  for (const child of workoutDays.docs) {
    batch.create(targetReference.collection('workoutDays').doc(child.id), { ...child.data(), ...audit })
  }
  for (const child of guides.docs) {
    batch.create(targetReference.collection('guides').doc(child.id), { ...child.data(), ...audit })
  }
  for (const child of weeks.docs) {
    batch.create(targetReference.collection('weeks').doc(child.id), { ...child.data(), ...audit })
  }

  await batch.commit()
  logger.info('Cloned published program', {
    database: databaseId,
    sourceProgramId,
    targetProgramId,
    nextVersion,
    workoutDayCount: workoutDays.size,
    guideCount: guides.size,
    actor: request.auth.uid,
  })

  return {
    database: databaseId,
    sourceProgramId,
    programId: targetProgramId,
    version: nextVersion,
    workoutDayCount: workoutDays.size,
    guideCount: guides.size,
  }
}
