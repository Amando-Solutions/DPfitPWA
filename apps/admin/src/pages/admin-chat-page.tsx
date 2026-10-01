import { type ChangeEvent, type FormEvent, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  AlertCircleIcon,
  CheckCheckIcon,
  InboxIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  ReplyIcon,
  SendIcon,
  SmilePlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import {
  adminQueryKeys,
  useAdminThreadsQuery,
  useCohortsQuery,
  useMembersQuery,
  useThreadMessagesQuery,
} from "@/hooks/use-admin-queries"
import {
  ADMIN_CHAT_REACTIONS,
  adminReplyPreview,
  adminReplyRefFor,
  markThreadRead,
  sendAdminMessage,
  toggleAdminReaction,
  type AdminChatMessage,
  type AdminChatThread,
  type AdminChatThreadKind,
} from "@/lib/admin-chat"

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatDateTime(value: Date | null) {
  if (!value || value.getTime() <= 0) return "Not yet"
  return dateTimeFormatter.format(value)
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function threadTitle(thread: ThreadOption) {
  return thread.kind === "group"
    ? `${thread.cohortName} group`
    : thread.memberName || "Direct thread"
}

type ThreadOption = {
  key: string
  cohortId: string
  cohortName: string
  threadId: string
  kind: AdminChatThreadKind
  memberName: string
  projectedThread: AdminChatThread | null
}

function threadOptionFromProjection(thread: AdminChatThread): ThreadOption {
  return {
    key: `${thread.cohortId}:${thread.threadId}`,
    cohortId: thread.cohortId,
    cohortName: thread.cohortName,
    threadId: thread.threadId,
    kind: thread.kind,
    memberName: thread.memberName,
    projectedThread: thread,
  }
}

export function AdminChatPage() {
  const { user } = useAdminAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const cohortsQuery = useCohortsQuery()
  const membersQuery = useMembersQuery()
  const cohorts = useMemo(() => cohortsQuery.data ?? [], [cohortsQuery.data])
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const cohortIds = useMemo(() => cohorts.map((cohort) => cohort.id), [cohorts])
  const groupThreadsQuery = useAdminThreadsQuery(cohortIds, "group")
  const directThreadsQuery = useAdminThreadsQuery(cohortIds, "direct")
  const groupThreads = useMemo(() => groupThreadsQuery.data ?? [], [groupThreadsQuery.data])
  const directThreads = useMemo(() => directThreadsQuery.data ?? [], [directThreadsQuery.data])
  const [text, setText] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [replyingTo, setReplyingTo] = useState<AdminChatMessage | null>(null)
  const [failedMessages, setFailedMessages] = useState<AdminChatMessage[]>([])
  const activeKind = (searchParams.get("kind") || "group") as AdminChatThreadKind
  const activeCohortId = searchParams.get("cohortId") || ""
  const activeThreadId = searchParams.get("threadId") || ""

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  )
  const cohortById = useMemo(
    () => new Map(cohorts.map((cohort) => [cohort.id, cohort])),
    [cohorts],
  )

  const groupOptions = useMemo(() => {
    const projected = new Map(groupThreads.map((thread) => [thread.cohortId, thread]))
    const options = cohorts.map((cohort) => {
      const thread = projected.get(cohort.id) ?? null
      return thread
        ? threadOptionFromProjection(thread)
        : {
            key: `${cohort.id}:cohort`,
            cohortId: cohort.id,
            cohortName: cohort.name,
            threadId: "cohort",
            kind: "group" as const,
            memberName: "",
            projectedThread: null,
          }
    })
    for (const thread of groupThreads) {
      if (!cohortById.has(thread.cohortId)) options.push(threadOptionFromProjection(thread))
    }
    return options
  }, [cohortById, cohorts, groupThreads])

  const directOptions = useMemo(() => {
    const projected = new Map(directThreads.map((thread) => [`${thread.cohortId}:${thread.threadId}`, thread]))
    const options = members.map((member) => {
      const thread = projected.get(`${member.cohortId}:${member.id}`) ?? null
      return thread
        ? threadOptionFromProjection(thread)
        : {
            key: `${member.cohortId}:${member.id}`,
            cohortId: member.cohortId,
            cohortName: member.cohortName,
            threadId: member.id,
            kind: "direct" as const,
            memberName: member.profile.displayName,
            projectedThread: null,
          }
    })
    for (const thread of directThreads) {
      if (!memberById.has(thread.threadId)) options.push(threadOptionFromProjection(thread))
    }
    return options
  }, [directThreads, memberById, members])

  const activeOptions = activeKind === "direct" ? directOptions : groupOptions
  const activeThread = activeCohortId && activeThreadId
    ? activeOptions.find(
        (thread) => thread.cohortId === activeCohortId && thread.threadId === activeThreadId,
      ) ?? null
    : null
  const selectedCohortId = activeThread?.cohortId ?? ""
  const selectedThreadId = activeThread?.threadId ?? ""
  const messagesQuery = useThreadMessagesQuery(selectedCohortId, selectedThreadId)
  const allMessages = useMemo(() => {
    const fetched = messagesQuery.data ?? []
    return [...fetched, ...failedMessages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
  }, [messagesQuery.data, failedMessages])
  const inboxError = cohortsQuery.error
    ?? membersQuery.error
    ?? groupThreadsQuery.error
    ?? directThreadsQuery.error
  const isLoadingDirectory = cohortsQuery.isPending || membersQuery.isPending
  const messageError = messagesQuery.error?.message ?? null
  const isLoadingMessages = Boolean(activeThread && messagesQuery.isPending)

  const sendMutation = useMutation({
    mutationFn: sendAdminMessage,
    onMutate: async (input) => {
      const queryKey = adminQueryKeys.chatMessages(input.cohortId, input.threadId)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<AdminChatMessage[]>(queryKey) ?? []
      const optimisticUrls: string[] = []
      const optimisticMessage: AdminChatMessage = {
        id: `temp-${crypto.randomUUID()}`,
        authorUid: input.user.uid,
        authorName: "Coach",
        isCoach: true,
        text: input.text,
        sentAt: new Date(),
        reactions: [],
        replyTo: input.replyTo,
        attachments: input.files.map((file) => {
          const downloadUrl = URL.createObjectURL(file)
          optimisticUrls.push(downloadUrl)
          return {
            id: `temp-${crypto.randomUUID()}`,
            kind: file.type.startsWith("image/") ? "image" : "file",
            name: file.name,
            bytes: file.size,
            mimeType: file.type,
            storagePath: "",
            downloadUrl,
          }
        }),
      }
      queryClient.setQueryData(queryKey, [...previous, optimisticMessage])
      setText("")
      setFiles([])
      setReplyingTo(null)
      return { previous, queryKey, input, optimisticUrls, optimisticMessage }
    },
    onSuccess: (result) => {
      if (!result.projectionUpdated) {
        toast.warning("Message sent, but inbox metadata could not be updated.")
      }
    },
    onError: (error, _input, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previous)
        setFailedMessages(prev => [...prev, {
          ...context.optimisticMessage,
          isFailed: true,
          pendingInput: context.input,
        }])
      }
      toast.error(error instanceof Error ? error.message : "Message could not be sent.")
    },
    onSettled: (_result, _error, _input, context) => {
      if (!_error) {
        context?.optimisticUrls.forEach((url) => URL.revokeObjectURL(url))
      }
      if (context) void queryClient.invalidateQueries({ queryKey: context.queryKey, exact: true })
    },
  })
  const markReadMutation = useMutation({
    mutationFn: markThreadRead,
    onSuccess: () => toast.success("Thread marked read"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Read state could not be saved."),
  })
  const reactionMutation = useMutation({
    mutationFn: toggleAdminReaction,
    onMutate: async (input) => {
      const queryKey = adminQueryKeys.chatMessages(input.cohortId, input.threadId)
      await queryClient.cancelQueries({ queryKey, exact: true })
      const previous = queryClient.getQueryData<AdminChatMessage[]>(queryKey) ?? []
      queryClient.setQueryData<AdminChatMessage[]>(queryKey, previous.map((message) => {
        if (message.id !== input.messageId) return message
        const current = message.reactions.find((reaction) => reaction.emoji === input.emoji)
        const removing = current?.mine === true
        const nextCount = Math.max(0, (current?.count ?? 0) + (removing ? -1 : 1))
        const reactions = message.reactions
          .filter((reaction) => reaction.emoji !== input.emoji)
          .concat(nextCount > 0 ? [{ emoji: input.emoji, count: nextCount, mine: !removing }] : [])
        return { ...message, reactions }
      }))
      return { previous, queryKey }
    },
    onError: (error, _input, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previous)
      toast.error(error instanceof Error ? error.message : "Reaction could not be saved.")
    },
    onSettled: (_result, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: adminQueryKeys.chatMessages(input.cohortId, input.threadId),
        exact: true,
      })
    },
  })
  const isSending = sendMutation.isPending

  function selectThread(option: ThreadOption) {
    setReplyingTo(null)
    setSearchParams({
      kind: option.kind,
      cohortId: option.cohortId,
      threadId: option.threadId,
    })
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []))
    event.currentTarget.value = ""
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeThread || !user) return
    const pendingText = text.trim()
    const pendingFiles = files
    if (!pendingText && pendingFiles.length === 0) return

    sendMutation.mutate({
      cohortId: activeThread.cohortId,
      cohortName: activeThread.cohortName,
      threadId: activeThread.threadId,
      kind: activeThread.kind,
      memberName: activeThread.memberName,
      text: pendingText,
      files: pendingFiles,
      replyTo: replyingTo ? adminReplyRefFor(replyingTo) : null,
      user,
    })
  }

  function handleRetry(message: AdminChatMessage) {
    if (!message.isFailed || !message.pendingInput) return
    setFailedMessages(prev => prev.filter(m => m.id !== message.id))
    sendMutation.mutate(message.pendingInput)
  }

  function handleMarkRead() {
    if (!activeThread || !user || !activeThread.projectedThread) return
    markReadMutation.mutate({
      cohortId: activeThread.cohortId,
      threadId: activeThread.threadId,
      user,
    })
  }

  function handleReaction(messageId: string, emoji: string) {
    if (!activeThread || !user) return
    reactionMutation.mutate({
      cohortId: activeThread.cohortId,
      threadId: activeThread.threadId,
      messageId,
      emoji,
    })
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full overflow-hidden rounded-xl border bg-background shadow-sm">
      {/* Sidebar / Thread List */}
      <aside className={cn("flex w-full min-w-0 shrink-0 flex-col border-r bg-muted/20 md:w-80 lg:w-96", activeThread ? "hidden md:flex" : "flex")}>
        <div className="flex flex-col gap-4 border-b p-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Group and direct member messages.</p>
          </div>
          <Tabs
            value={activeKind}
            onValueChange={(value) => {
              setSearchParams({ kind: value as AdminChatThreadKind })
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="group"><UsersIcon data-icon="inline-start" /> Group</TabsTrigger>
              <TabsTrigger value="direct"><MessageSquareTextIcon data-icon="inline-start" /> Direct</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {inboxError && (
            <Alert variant="destructive" className="mb-4">
              <InboxIcon />
              <AlertTitle>Inbox unavailable</AlertTitle>
              <AlertDescription>{inboxError.message}</AlertDescription>
            </Alert>
          )}

          {isLoadingDirectory ? (
            <div className="grid gap-3">
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
          ) : (
            <>
              {activeKind === "group" && (
                <div className="grid gap-1.5">
                  {groupOptions.map((option) => (
                    <ThreadButton key={option.key} option={option} active={option.key === activeThread?.key} onSelect={selectThread} />
                  ))}
                </div>
              )}
              {activeKind === "direct" && (
                <div className="grid gap-1.5">
                  {directOptions.map((option) => (
                    <ThreadButton key={option.key} option={option} active={option.key === activeThread?.key} onSelect={selectThread} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className={cn("flex min-w-0 flex-1 flex-col bg-background", activeThread ? "flex" : "hidden md:flex")}>
        {!activeThread ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <Empty className="max-w-md border-0 bg-transparent shadow-none">
              <EmptyHeader>
                <EmptyMedia variant="icon"><MessageSquareTextIcon className="text-muted-foreground/30" size={48} /></EmptyMedia>
                <EmptyTitle>Select a thread</EmptyTitle>
                <EmptyDescription>Choose a conversation from the sidebar to view messages or start a new one.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Chat Header */}
            <header className="flex h-16 shrink-0 items-center justify-between border-b px-4">
              <div className="flex min-w-0 items-center gap-3">
                <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={() => setSearchParams({ kind: activeKind })}>
                  <ArrowLeftIcon />
                  <span className="sr-only">Back</span>
                </Button>
                <Avatar className="size-9 hidden sm:flex">
                  <AvatarFallback className="text-xs">{initials(threadTitle(activeThread))}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{threadTitle(activeThread)}</p>
                  <p className="truncate text-xs text-muted-foreground">{activeThread.cohortName}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {activeThread.projectedThread?.unreadForAdmin && <Badge variant="destructive" className="hidden sm:inline-flex">Unread</Badge>}
                <Button type="button" variant="ghost" size="icon-sm" disabled={!activeThread.projectedThread} onClick={() => void handleMarkRead()}>
                  <CheckCheckIcon className="size-4" />
                  <span className="sr-only">Mark read</span>
                </Button>
              </div>
            </header>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto bg-muted/10 p-4">
              {messageError && (
                <Alert variant="destructive" className="mb-4">
                  <InboxIcon />
                  <AlertTitle>Thread unavailable</AlertTitle>
                  <AlertDescription>{messageError}</AlertDescription>
                </Alert>
              )}
              {isLoadingMessages && !messageError ? (
                <div className="grid gap-4">
                  <Skeleton className="h-16 w-3/4 rounded-2xl rounded-bl-sm" />
                  <Skeleton className="h-12 w-1/2 rounded-2xl rounded-bl-sm" />
                  <Skeleton className="h-20 w-2/3 justify-self-end rounded-2xl rounded-br-sm" />
                </div>
              ) : null}
              {!isLoadingMessages && !messageError && allMessages.length === 0 && (
                <p className="py-20 text-center text-sm text-muted-foreground">No messages in this thread yet.</p>
              )}
              <div className="flex flex-col gap-4">
                {allMessages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    own={message.authorUid === user?.uid}
                    viewerUid={user?.uid ?? ""}
                    onRetry={() => handleRetry(message)}
                    onReply={() => setReplyingTo(message)}
                    onReact={(emoji) => handleReaction(message.id, emoji)}
                    reactionPending={
                      reactionMutation.isPending
                      && reactionMutation.variables?.messageId === message.id
                    }
                  />
                ))}
              </div>
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="flex items-end gap-2 border-t bg-background p-3 sm:px-4">
              <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={() => document.getElementById('chat-file-upload')?.click()}>
                <PaperclipIcon />
                <span className="sr-only">Attach files</span>
              </Button>
              <input type="file" id="chat-file-upload" multiple className="hidden" onChange={handleFileChange} />
              
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {replyingTo && (
                  <div className="flex min-w-0 items-center gap-3 rounded-md border-l-2 border-primary bg-muted/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-primary">
                        Replying to {replyingTo.authorUid === user?.uid ? "yourself" : `@${replyingTo.isCoach ? "Coach" : replyingTo.authorName}`}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {adminReplyPreview(adminReplyRefFor(replyingTo))}
                      </p>
                    </div>
                    {replyingTo.attachments[0]?.kind === "image" && (
                      <img
                        src={replyingTo.attachments[0].downloadUrl}
                        alt={replyingTo.attachments[0].name}
                        className="size-10 shrink-0 rounded object-cover"
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => setReplyingTo(null)}
                      title="Cancel reply"
                      aria-label="Cancel reply"
                    >
                      <XIcon />
                    </Button>
                  </div>
                )}
                {files.length > 0 && (
                  <div className="text-[10px] font-medium text-primary ml-2">{files.length} file(s) ready to send</div>
                )}
                <Textarea
                  value={text}
                  maxLength={2000}
                  placeholder="Message..."
                  className="min-h-10 max-h-32 w-full resize-none rounded-2xl border-transparent bg-muted/50 px-4 py-2.5 text-sm focus-visible:bg-muted/80 focus-visible:ring-0 shadow-none"
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.currentTarget.form?.requestSubmit()
                    }
                  }}
                />
              </div>
              <Button type="submit" size="icon" className="shrink-0 rounded-full shadow-sm" disabled={isSending || (text.trim().length === 0 && files.length === 0)}>
                {isSending ? <Spinner /> : <SendIcon />}
                <span className="sr-only">Send message</span>
              </Button>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}

function ThreadButton({
  option,
  active,
  onSelect,
}: {
  option: ThreadOption
  active: boolean
  onSelect: (option: ThreadOption) => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full flex-col items-start gap-1 rounded-xl p-3 text-left transition-colors",
        active ? "bg-primary/10" : "hover:bg-muted/50"
      )}
      onClick={() => onSelect(option)}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-semibold", active ? "text-primary" : "text-foreground")}>
            {threadTitle(option)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 mt-0.5">
          <span className={cn("text-[10px] whitespace-nowrap", active ? "text-primary/70" : "text-muted-foreground")}>
            {formatDateTime(option.projectedThread?.updatedAt ?? null)}
          </span>
          {option.projectedThread?.unreadForAdmin && (
            <span className="flex size-2 shrink-0 rounded-full bg-destructive shadow-sm"></span>
          )}
        </div>
      </div>
      <p className={cn("line-clamp-1 w-full text-xs", active ? "text-primary/80" : "text-muted-foreground")}>
        {option.projectedThread?.lastMessageText || "No messages yet."}
      </p>
    </button>
  )
}

function MessageBubble({
  message,
  own,
  viewerUid,
  onRetry,
  onReply,
  onReact,
  reactionPending,
}: {
  message: AdminChatMessage
  own: boolean
  viewerUid: string
  onRetry?: () => void
  onReply: () => void
  onReact: (emoji: string) => void
  reactionPending: boolean
}) {
  const authorName = message.isCoach ? "Coach" : message.authorName
  const canActOnMessage = !message.isFailed && !message.id.startsWith("temp-")
  const replyButton = canActOnMessage ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title="Reply"
      aria-label="Reply"
      className="shrink-0 rounded-full text-muted-foreground opacity-70 hover:opacity-100"
      onClick={onReply}
    >
      <ReplyIcon />
    </Button>
  ) : null
  const reactionMenu = canActOnMessage ? (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={reactionPending}
            title="Add reaction"
            aria-label="Add reaction"
            className="shrink-0 rounded-full text-muted-foreground opacity-70 hover:opacity-100"
          />
        )}
      >
        <SmilePlusIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={own ? "end" : "start"} className="w-auto min-w-0">
        <DropdownMenuGroup className="flex gap-1">
          {ADMIN_CHAT_REACTIONS.map((emoji) => (
            <DropdownMenuItem
              key={emoji}
              className="size-9 justify-center p-0 text-lg"
              aria-label={`React with ${emoji}`}
              onClick={() => onReact(emoji)}
            >
              {emoji}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null
  const messageActions = canActOnMessage ? (
    <div className="flex shrink-0 items-center">
      {replyButton}
      {reactionMenu}
    </div>
  ) : null

  return (
    <div
      id={`chat-message-${message.id}`}
      className={cn("flex items-center gap-1", own ? "justify-end" : "justify-start")}
    >
      {own && message.isFailed && (
        <button
          type="button"
          onClick={onRetry}
          className="mr-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          title="Message failed to send. Click to retry."
        >
          <AlertCircleIcon className="size-3.5" />
        </button>
      )}
      {own && messageActions}
      <div className={cn("flex max-w-[85%] sm:max-w-md flex-col", own ? "items-end" : "items-start", message.isFailed && "opacity-75")}>
        <div className={cn(
          "rounded-2xl px-4 py-2 shadow-sm",
          own ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-background border rounded-bl-sm",
          message.isFailed && "border border-destructive/50"
        )}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-medium opacity-70">
            {!own && <span>{authorName}</span>}
          </div>
          {message.replyTo && (
            <button
              type="button"
              className={cn(
                "mb-2 block w-full border-l-2 px-2 py-1 text-left",
                own ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary bg-muted/70",
              )}
              onClick={() => document.getElementById(`chat-message-${message.replyTo?.messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
              title="Go to replied message"
            >
              <span className="block truncate text-[11px] font-semibold">
                @{message.replyTo.authorUid === viewerUid ? "You" : message.replyTo.authorName}
              </span>
              <span className="block truncate text-xs opacity-80">{adminReplyPreview(message.replyTo)}</span>
            </button>
          )}
          {message.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>}
          {message.attachments.length > 0 && (
            <div className="mt-3 grid gap-2">
              {message.attachments.map((attachment) =>
                attachment.kind === "image" ? (
                  <a
                    key={attachment.id}
                    href={attachment.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-lg"
                  >
                    <img
                      src={attachment.downloadUrl}
                      alt={attachment.name}
                      loading="lazy"
                      className="max-h-80 w-full object-cover"
                    />
                  </a>
                ) : (
                  <a
                    key={attachment.id}
                    href={attachment.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                      own ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30" : "bg-muted text-foreground hover:bg-muted/80",
                    )}
                  >
                    <PaperclipIcon />
                    <span className="truncate">{attachment.name}</span>
                  </a>
                ),
              )}
            </div>
          )}
        </div>
        {message.reactions.length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1.5 px-1", own ? "justify-end" : "justify-start")}>
            {message.reactions.map((reaction) => (
              <button
                type="button"
                key={reaction.emoji}
                className={cn(
                  "inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm transition-colors hover:bg-muted",
                  reaction.mine && "border-primary ring-1 ring-primary/40",
                )}
                aria-label={`${reaction.count} reacted ${reaction.emoji}`}
                aria-pressed={reaction.mine}
                disabled={reactionPending}
                onClick={() => onReact(reaction.emoji)}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        )}
        <span className={cn("mt-1 px-2 text-[10px]", message.isFailed ? "text-destructive font-medium" : "text-muted-foreground")}>
          {message.isFailed ? "Failed to send" : formatDateTime(message.sentAt)}
        </span>
      </div>
      {!own && messageActions}
    </div>
  )
}
