import type { User } from "firebase/auth"
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"

import {
  firebaseDatabaseId,
  firebaseDb,
  firebaseFunctions,
} from "@/lib/firebase"

export type StoredCodeStatus = "unused" | "claimed" | "revoked"
export type CodeStatus = StoredCodeStatus | "expired"

export type AccessCodeRecord = {
  id: string
  code: string
  cohortId: string
  cohortName: string
  status: StoredCodeStatus
  createdAt: Date
  expiresAt: Date
  /** Who may redeem it. `null` only on codes from before every code had one. */
  issuedToEmail: string | null
  claimedByName: string | null
}

export type IssueAccessCodeInput = {
  cohortId: string
  /** Whole days, 1–365: how long it can be redeemed. */
  expiryDays: number
  /** The only address that can redeem it. */
  email: string
  /** Copied into the member's profile. Optional, but it's how the coach reaches them. */
  whatsapp: string
}

/** What `createAccessCode` in `apps/functions` resolves to. */
export type IssuedAccessCode = {
  code: string
  /** The email already held a live code for this cohort, and this is it. */
  reused: boolean
  database: string
  cohortId: string
  cohortName: string
  issuedToEmail: string
  /** ISO 8601. */
  expiresAt: string
}

const ACCESS_CODE_LIMIT = 200
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function requireDatabase() {
  if (!firebaseDb) {
    throw new Error("Firebase is not configured.")
  }

  return firebaseDb
}

function readDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : new Date(0)
}

/**
 * The status to show. An unused code reads as expired once its redeem-by date
 * passes, and once its cohort is over: it would still redeem, but only onto the
 * ended screen.
 */
export function effectiveCodeStatus(record: AccessCodeRecord, cohortEnded = false): CodeStatus {
  if (record.status === "unused" && (cohortEnded || record.expiresAt.getTime() <= Date.now())) {
    return "expired"
  }

  return record.status
}

export function subscribeToAccessCodes(
  onData: (records: AccessCodeRecord[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(
      () => onError("Access codes are not configured."),
      0,
    )
    return () => window.clearTimeout(timeout)
  }

  const database = firebaseDb
  const codesQuery = query(
    collection(database, "accessCodes"),
    orderBy("createdAt", "desc"),
    limit(ACCESS_CODE_LIMIT),
  )

  return onSnapshot(
    codesQuery,
    (snapshot) => {
      const records = snapshot.docs.map((snapshotDocument) => {
        const data = snapshotDocument.data({ serverTimestamps: "estimate" })

        return {
          id: snapshotDocument.id,
          code: String(data.code ?? snapshotDocument.id),
          cohortId: String(data.cohortId ?? ""),
          cohortName: String(data.cohortName ?? "Unassigned"),
          status: data.status as StoredCodeStatus,
          createdAt: readDate(data.createdAt),
          expiresAt: readDate(data.expiresAt),
          issuedToEmail:
            typeof data.issuedToEmail === "string" && data.issuedToEmail ? data.issuedToEmail : null,
          claimedByName:
            typeof data.claimedByName === "string" ? data.claimedByName : null,
        } satisfies AccessCodeRecord
      })

      onData(records)
    },
    () => onError("The code inventory could not be loaded."),
  )
}

/**
 * Issue one code to one person through `createAccessCode`, the only writer of
 * codes. If the email already holds a live code for the cohort, that code comes
 * back with `reused: true` instead of a second one. Nothing is sent: the code
 * reaches the person only if the admin passes it on.
 */
export async function issueAccessCode({ cohortId, expiryDays, email, whatsapp }: IssueAccessCodeInput) {
  if (!firebaseFunctions) throw new Error("Firebase Functions is not configured.")

  const address = email.trim().toLowerCase()
  if (!EMAIL.test(address)) throw new Error("Enter the email address the person will sign up with.")

  const createAccessCode = httpsCallable<
    { database: string; cohortId: string; expiryDays: number; email: string; whatsapp?: string },
    IssuedAccessCode
  >(firebaseFunctions, "createAccessCode")

  const number = whatsapp.trim()
  const result = await createAccessCode({
    database: firebaseDatabaseId,
    cohortId,
    expiryDays,
    email: address,
    ...(number ? { whatsapp: number } : {}),
  })
  return result.data
}

/** The only fields a revoke writes: the rules let the coach change anything on a code. */
const revoked = (user: User) => ({
  status: "revoked",
  revokedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  updatedByUid: user.uid,
  updatedByEmail: user.email ?? "",
})

export async function revokeAccessCode(codeId: string, user: User) {
  const database = requireDatabase()
  await updateDoc(doc(database, "accessCodes", codeId), revoked(user))
}

/** Revoke several codes together, all or none. At most 500, one batch's worth. */
export async function revokeAccessCodes(codeIds: string[], user: User) {
  if (codeIds.length === 0) return
  if (codeIds.length > 500) throw new Error("Revoke at most 500 codes at a time.")
  const database = requireDatabase()
  const batch = writeBatch(database)
  for (const codeId of codeIds) batch.update(doc(database, "accessCodes", codeId), revoked(user))
  await batch.commit()
}
