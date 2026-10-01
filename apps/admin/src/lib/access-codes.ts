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
  claimedByName: string | null
}

type GenerateAccessCodesInput = {
  quantity: number
  cohortId: string
  expiryDays: number
}

const ACCESS_CODE_LIMIT = 200

function requireDatabase() {
  if (!firebaseDb) {
    throw new Error("Firebase is not configured.")
  }

  return firebaseDb
}

function readDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : new Date(0)
}

export function effectiveCodeStatus(record: AccessCodeRecord): CodeStatus {
  if (record.status === "unused" && record.expiresAt.getTime() <= Date.now()) {
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
          claimedByName:
            typeof data.claimedByName === "string" ? data.claimedByName : null,
        } satisfies AccessCodeRecord
      })

      onData(records)
    },
    () => onError("The code inventory could not be loaded."),
  )
}

export async function generateAccessCodes({
  quantity,
  cohortId,
  expiryDays,
}: GenerateAccessCodesInput) {
  if (!firebaseFunctions) throw new Error("Firebase Functions is not configured.")

  const safeQuantity = Math.min(20, Math.max(1, Math.trunc(quantity)))
  const createAccessCode = httpsCallable<
    {
      database: string
      cohortId: string
      expiryDays: number
      quantity: number
    },
    { codes: string[] }
  >(firebaseFunctions, "createAccessCode")

  const result = await createAccessCode({
    database: firebaseDatabaseId,
    cohortId,
    expiryDays,
    quantity: safeQuantity,
  })

  if (
    !Array.isArray(result.data.codes) ||
    result.data.codes.length !== safeQuantity
  ) {
    throw new Error(
      "The access-code service returned an incompatible response. Deploy the shared function before using batch generation.",
    )
  }

  return result.data.codes
}

export async function revokeAccessCode(codeId: string, user: User) {
  const database = requireDatabase()

  await updateDoc(doc(database, "accessCodes", codeId), {
    status: "revoked",
    revokedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email ?? "",
  })
}
