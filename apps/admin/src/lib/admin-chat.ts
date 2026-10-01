import type { User } from "firebase/auth"
import {
  collection,
  deleteField,
  doc,
  FieldPath,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore"
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage"

import { firebaseDb, firebaseStorage } from "@/lib/firebase"

export type AdminChatThreadKind = "group" | "direct"

export type AdminChatThread = {
  id: string
  threadId: string
  cohortId: string
  cohortName: string
  kind: AdminChatThreadKind
  memberUid: string | null
  memberName: string
  lastMessageText: string
  lastMessageAt: Date | null
  lastMessageAuthorUid: string
  lastMessageAuthorName: string
  lastReadByAdminAt: Date | null
  unreadForAdmin: boolean
  updatedAt: Date | null
}

export type AdminChatAttachment = {
  id: string
  kind: "image" | "file"
  name: string
  bytes: number
  mimeType: string
  storagePath: string
  downloadUrl: string
}

export type AdminChatReaction = {
  emoji: string
  count: number
  mine: boolean
}

export type AdminChatReplyRef = {
  messageId: string
  authorUid: string
  authorName: string
  text: string
  attachmentKind: "image" | "file" | null
}

export type AdminChatMessage = {
  id: string
  authorUid: string
  authorName: string
  text: string
  sentAt: Date
  isCoach: boolean
  attachments: AdminChatAttachment[]
  replyTo: AdminChatReplyRef | null
  reactions: AdminChatReaction[]
  isFailed?: boolean
  pendingInput?: SendAdminMessageInput
}

export type SendAdminMessageInput = {
  cohortId: string
  cohortName: string
  threadId: string
  kind: AdminChatThreadKind
  memberName: string
  text: string
  files: File[]
  replyTo: AdminChatReplyRef | null
  user: User
}

export type ToggleAdminReactionInput = {
  cohortId: string
  threadId: string
  messageId: string
  emoji: string
}

const THREAD_LIMIT = 100
const MESSAGE_LIMIT = 80
const REPLY_EXCERPT_CHARS = 140
export const ADMIN_CHAT_REACTIONS = ["💗", "🔥", "💪", "👏", "😂", "👍"] as const

function requireDatabase() {
  if (!firebaseDb) throw new Error("Firebase is not configured.")
  return firebaseDb
}

function requireStorage() {
  if (!firebaseStorage) throw new Error("Firebase Storage is not configured.")
  return firebaseStorage
}

function readDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : null
}

function readMessageDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : new Date(0)
}

function readAttachment(value: unknown): AdminChatAttachment | null {
  if (!value || typeof value !== "object") return null
  const attachment = value as Record<string, unknown>
  const mimeType = String(attachment.mimeType ?? attachment.contentType ?? "application/octet-stream")
  const storagePath = String(attachment.storagePath ?? "")
  const downloadUrl = String(attachment.downloadUrl ?? attachment.url ?? "")
  if (!downloadUrl) return null
  return {
    id: String(attachment.id ?? (storagePath || downloadUrl)),
    kind: attachment.kind === "image" || mimeType.startsWith("image/") ? "image" : "file",
    name: String(attachment.name ?? "Attachment"),
    bytes: Number(attachment.bytes ?? attachment.size ?? 0),
    mimeType,
    storagePath,
    downloadUrl,
  }
}

function readReplyRef(value: unknown): AdminChatReplyRef | null {
  if (!value || typeof value !== "object") return null
  const reply = value as Record<string, unknown>
  const attachmentKind = reply.attachmentKind === "image" || reply.attachmentKind === "file"
    ? reply.attachmentKind
    : null
  const messageId = String(reply.messageId ?? "")
  if (!messageId) return null
  return {
    messageId,
    authorUid: String(reply.authorUid ?? ""),
    authorName: String(reply.authorName ?? "Unknown"),
    text: String(reply.text ?? ""),
    attachmentKind,
  }
}

export function adminReplyRefFor(message: AdminChatMessage): AdminChatReplyRef {
  const text = message.text.trim()
  const [firstAttachment] = message.attachments
  return {
    messageId: message.id,
    authorUid: message.authorUid,
    authorName: message.isCoach ? "Coach" : message.authorName,
    text: text.length > REPLY_EXCERPT_CHARS
      ? `${text.slice(0, REPLY_EXCERPT_CHARS).trimEnd()}…`
      : text,
    attachmentKind: text ? null : (firstAttachment?.kind ?? null),
  }
}

export function adminReplyPreview(reply: AdminChatReplyRef) {
  if (reply.text) return reply.text
  if (reply.attachmentKind === "image") return "Photo"
  if (reply.attachmentKind === "file") return "Attachment"
  return "Message"
}

function readReactions(value: unknown, mine: string[] = []): AdminChatReaction[] {
  if (!value || typeof value !== "object") return []
  return Object.entries(value as Record<string, unknown>)
    .map(([emoji, count]) => ({ emoji, count: Number(count ?? 0), mine: mine.includes(emoji) }))
    .filter((reaction) => reaction.emoji && reaction.count > 0)
}

function readReactionEmojis(value: unknown) {
  if (!value || typeof value !== "object") return []
  const emojis = (value as { emojis?: unknown }).emojis
  return Array.isArray(emojis) ? emojis.filter((emoji): emoji is string => typeof emoji === "string") : []
}

function readThread(
  snapshotDocument: QueryDocumentSnapshot<DocumentData, DocumentData>,
  fallbackKind: AdminChatThreadKind,
) {
  const data = snapshotDocument.data({ serverTimestamps: "estimate" })
  return {
    id: snapshotDocument.ref.path,
    threadId: String(data.threadId ?? snapshotDocument.id),
    cohortId: String(data.cohortId ?? snapshotDocument.ref.parent.parent?.id ?? ""),
    cohortName: String(data.cohortName ?? "Cohort"),
    kind: (data.kind ?? fallbackKind) as AdminChatThreadKind,
    memberUid: typeof data.memberUid === "string" ? data.memberUid : null,
    memberName: String(data.memberName ?? ""),
    lastMessageText: String(data.lastMessageText ?? ""),
    lastMessageAt: readDate(data.lastMessageAt),
    lastMessageAuthorUid: String(data.lastMessageAuthorUid ?? ""),
    lastMessageAuthorName: String(data.lastMessageAuthorName ?? ""),
    lastReadByAdminAt: readDate(data.lastReadByAdminAt),
    unreadForAdmin: data.unreadForAdmin === true,
    updatedAt: readDate(data.updatedAt),
  } satisfies AdminChatThread
}

export function subscribeToAdminThreads(
  cohortIds: string[],
  kind: AdminChatThreadKind,
  onData: (threads: AdminChatThread[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(
      () => onError("Admin chat is not configured."),
      0,
    )
    return () => window.clearTimeout(timeout)
  }

  const uniqueCohortIds = [...new Set(cohortIds.filter(Boolean))]
  if (uniqueCohortIds.length === 0) {
    onData([])
    return () => undefined
  }

  const threadsByCohort = new Map<string, AdminChatThread[]>()
  const publish = () => {
    onData(
      [...threadsByCohort.values()]
        .flat()
        .filter((thread) => thread.kind === kind)
        .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0))
        .slice(0, THREAD_LIMIT),
    )
  }

  const unsubscribes = uniqueCohortIds.map((cohortId) =>
    onSnapshot(
      collection(firebaseDb, "cohorts", cohortId, "threads"),
      (snapshot) => {
        threadsByCohort.set(cohortId, snapshot.docs.map((item) => readThread(item, kind)))
        publish()
      },
      (error) => onError(
        error.code === "permission-denied"
          ? "Your admin account does not have permission to read chat threads."
          : "The chat inbox could not be loaded.",
      ),
    ),
  )

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
}

export function subscribeToThreadMessages(
  cohortId: string,
  threadId: string,
  onData: (messages: AdminChatMessage[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  if (!firebaseDb) {
    const timeout = window.setTimeout(
      () => onError("Admin chat is not configured."),
      0,
    )
    return () => window.clearTimeout(timeout)
  }

  const messagesQuery = query(
    collection(firebaseDb, "cohorts", cohortId, "threads", threadId, "messages"),
    orderBy("sentAt", "desc"),
    limit(MESSAGE_LIMIT),
  )

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      onData(
        snapshot.docs
          .map((snapshotDocument) => {
            const data = snapshotDocument.data({ serverTimestamps: "estimate" })
            const attachments = Array.isArray(data.attachments)
              ? data.attachments.map(readAttachment).filter((item): item is AdminChatAttachment => Boolean(item))
              : []
            return {
              id: snapshotDocument.id,
              authorUid: String(data.authorUid ?? ""),
              authorName: String(data.authorName ?? "Unknown"),
              text: String(data.text ?? ""),
              sentAt: readMessageDate(data.sentAt),
              isCoach: data.isCoach === true,
              attachments,
              replyTo: readReplyRef(data.replyTo),
              reactions: readReactions(
                data.reactionCounts,
                readReactionEmojis({ emojis: data.adminReactionEmojis }),
              ),
            } satisfies AdminChatMessage
          })
          .reverse(),
      )
    },
    () => onError("The chat thread could not be loaded."),
  )
}

export async function toggleAdminReaction(input: ToggleAdminReactionInput) {
  if (!ADMIN_CHAT_REACTIONS.includes(input.emoji as typeof ADMIN_CHAT_REACTIONS[number])) {
    throw new Error("Choose a supported reaction.")
  }

  const database = requireDatabase()
  const messageRef = doc(
    database,
    "cohorts",
    input.cohortId,
    "threads",
    input.threadId,
    "messages",
    input.messageId,
  )
  await runTransaction(database, async (transaction) => {
    const messageSnapshot = await transaction.get(messageRef)
    if (!messageSnapshot.exists()) throw new Error("Message not found.")

    const current = readReactionEmojis({ emojis: messageSnapshot.data().adminReactionEmojis })
    const removing = current.includes(input.emoji)
    const next = removing
      ? current.filter((emoji) => emoji !== input.emoji)
      : [...current, input.emoji]

    const counts = messageSnapshot.data().reactionCounts as Record<string, number> | undefined
    const nextCount = Number(counts?.[input.emoji] ?? 0) + (removing ? -1 : 1)
    const reactionPath = new FieldPath("reactionCounts", input.emoji)
    transaction.update(
      messageRef,
      reactionPath,
      nextCount <= 0 ? deleteField() : increment(removing ? -1 : 1),
      "adminReactionEmojis",
      next,
    )
  })
}

async function uploadChatAttachments({
  cohortId,
  user,
  files,
}: {
  cohortId: string
  user: User
  files: File[]
}) {
  if (files.length === 0) return []
  const storage = requireStorage()

  return Promise.all(
    files.map(async (file) => {
      if (file.size >= 2 * 1024 * 1024) {
        throw new Error(`${file.name} must be smaller than the 2 MB chat attachment limit.`)
      }
      const path = `chat/${cohortId}/${user.uid}/${crypto.randomUUID()}-${file.name.replaceAll("/", "-")}`
      const storageReference = ref(storage, path)
      await uploadBytes(storageReference, file, { contentType: file.type || "application/octet-stream" })
      const url = await getDownloadURL(storageReference)
      return {
        id: path,
        kind: file.type.startsWith("image/") ? "image" : "file",
        name: file.name,
        bytes: file.size,
        mimeType: file.type || "application/octet-stream",
        storagePath: path,
        downloadUrl: url,
      } satisfies AdminChatAttachment
    }),
  )
}

export async function sendAdminMessage(input: SendAdminMessageInput) {
  const database = requireDatabase()
  const text = input.text.trim()
  if (text.length > 2000 || (text.length === 0 && input.files.length === 0)) {
    throw new Error("Add a message or at least one attachment.")
  }

  const attachments = await uploadChatAttachments({
    cohortId: input.cohortId,
    user: input.user,
    files: input.files,
  })

  const messageRef = doc(
    collection(database, "cohorts", input.cohortId, "threads", input.threadId, "messages"),
  )
  const threadRef = doc(database, "cohorts", input.cohortId, "threads", input.threadId)
  const addressedUids = new Set(input.threadId === "cohort" ? [] : [input.threadId])
  if (input.replyTo?.authorUid && input.replyTo.authorUid !== input.user.uid) {
    addressedUids.add(input.replyTo.authorUid)
  }
  const authorName = "Coach"

  await setDoc(messageRef, {
    authorUid: input.user.uid,
    authorName,
    authorAvatarUrl: "",
    text,
    sentAt: serverTimestamp(),
    editedAt: null,
    isCoach: true,
    reactionCounts: {},
    addressedUids: [...addressedUids],
    attachments,
    replyTo: input.replyTo,
    mentions: [],
  })

  try {
    await setDoc(threadRef, {
      threadId: input.threadId,
      cohortId: input.cohortId,
      kind: input.kind,
      memberUid: input.kind === "direct" ? input.threadId : null,
      memberName: input.memberName,
      cohortName: input.cohortName,
      lastMessageText: text || (attachments.some((item) => item.kind === "image") ? "Sent an image" : "Sent an attachment"),
      lastMessageAt: serverTimestamp(),
      lastMessageAuthorUid: input.user.uid,
      lastMessageAuthorName: authorName,
      lastReadByAdminAt: serverTimestamp(),
      unreadForAdmin: false,
      updatedAt: serverTimestamp(),
      updatedByUid: input.user.uid,
      updatedByEmail: input.user.email,
    }, { merge: true })
    return { projectionUpdated: true }
  } catch {
    return { projectionUpdated: false }
  }
}

export async function markThreadRead({
  cohortId,
  threadId,
  user,
}: {
  cohortId: string
  threadId: string
  user: User
}) {
  const database = requireDatabase()
  await updateDoc(doc(database, "cohorts", cohortId, "threads", threadId), {
    lastReadByAdminAt: serverTimestamp(),
    unreadForAdmin: false,
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
    updatedByEmail: user.email,
  })
}
