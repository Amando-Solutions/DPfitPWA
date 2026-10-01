import { useMemo, useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { ExternalLinkIcon, PencilIcon, PlusIcon, Trash2Icon, VideoIcon } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { useCohortsQuery, useLiveCallsQuery } from "@/hooks/use-admin-queries"
import type { CohortRecord } from "@/lib/cohorts"
import { callEnd, createLiveCall, deleteLiveCall, updateLiveCall, type LiveCallRecord } from "@/lib/live-calls"
import { cn } from "@/lib/utils"

type FormState = { title: string; cohortId: string; date: string; time: string; durationMinutes: string; joinUrl: string }

const pad = (value: number) => String(value).padStart(2, "0")
const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const localTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`
// The browser's zone, e.g. "GMT+1": dates are entered and shown in the admin's local time.
const zoneLabel = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value ?? ""

function emptyForm(cohortId: string): FormState {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return { title: "Weekly live call", cohortId, date: localDate(tomorrow), time: "19:00", durationMinutes: "60", joinUrl: "" }
}

function formFor(call: LiveCallRecord): FormState {
  return { title: call.title, cohortId: call.cohortId, date: localDate(call.startsAt), time: localTime(call.startsAt), durationMinutes: String(call.durationMinutes), joinUrl: call.joinUrl }
}

function CallForm({ call, cohorts, onDone }: { call: LiveCallRecord | null; cohorts: CohortRecord[]; onDone: () => void }) {
  const { user } = useAdminAuth()
  const [form, setForm] = useState<FormState>(() => call ? formFor(call) : emptyForm(cohorts[0]?.id ?? ""))
  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }))
  const mutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Your admin session has expired.")
      const cohort = cohorts.find((item) => item.id === form.cohortId)
      const input = {
        title: form.title, cohortId: form.cohortId, cohortName: cohort?.name ?? call?.cohortName ?? "",
        startsAt: new Date(`${form.date}T${form.time}`), durationMinutes: Number(form.durationMinutes), joinUrl: form.joinUrl,
      }
      return call ? updateLiveCall(call, input, user) : createLiveCall(input, user)
    },
    onSuccess: () => { toast.success(call ? "Call updated" : "Call scheduled"); onDone() },
    onError: (error) => toast.error(error.message),
  })
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate() }
  const busy = mutation.isPending
  const cohortItems = cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name }))

  return <form onSubmit={submit} className="contents">
    <FieldGroup className="gap-4">
      <Field className="gap-1.5"><FieldLabel htmlFor="call-title">Title</FieldLabel><Input id="call-title" value={form.title} maxLength={100} required disabled={busy} onChange={(event) => set({ title: event.target.value })} /></Field>
      <Field className="gap-1.5"><FieldLabel htmlFor="call-cohort">Cohort</FieldLabel>
        <Select items={cohortItems} value={form.cohortId || null} disabled={busy} onValueChange={(value) => value && set({ cohortId: value })}>
          <SelectTrigger id="call-cohort" className="w-full"><SelectValue placeholder="Choose a cohort" /></SelectTrigger>
          <SelectContent><SelectGroup>{cohortItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem] gap-3">
        <Field className="gap-1.5"><FieldLabel htmlFor="call-date">Date</FieldLabel><Input id="call-date" type="date" value={form.date} required disabled={busy} onChange={(event) => set({ date: event.target.value })} /></Field>
        <Field className="gap-1.5"><FieldLabel htmlFor="call-time">Time <span className="font-normal text-muted-foreground">({zoneLabel})</span></FieldLabel><Input id="call-time" type="time" value={form.time} required disabled={busy} onChange={(event) => set({ time: event.target.value })} /></Field>
        <Field className="gap-1.5"><FieldLabel htmlFor="call-duration">Minutes</FieldLabel><Input id="call-duration" type="number" min={5} max={480} step={5} value={form.durationMinutes} required disabled={busy} onChange={(event) => set({ durationMinutes: event.target.value })} /></Field>
      </div>
      <Field className="gap-1.5"><FieldLabel htmlFor="call-link">Meeting link</FieldLabel><Input id="call-link" type="url" value={form.joinUrl} required disabled={busy} placeholder="https://meet.google.com/…" onChange={(event) => set({ joinUrl: event.target.value })} /><FieldDescription>Google Meet, Zoom, or any https link. Members open it in a new tab.</FieldDescription></Field>
    </FieldGroup>
    <DialogFooter>
      <Button type="button" variant="outline" disabled={busy} onClick={onDone}>Cancel</Button>
      <Button type="submit" disabled={busy || !form.cohortId}>{busy && <Spinner />}{call ? "Save changes" : "Schedule call"}</Button>
    </DialogFooter>
  </form>
}

function CallRow({ call, now, next, onEdit, onDelete }: { call: LiveCallRecord; now: number; next: boolean; onEdit: () => void; onDelete: () => void }) {
  const past = callEnd(call).getTime() < now
  return <li className={cn("flex items-center gap-4 border-t px-4 py-3 first:border-t-0", past && "text-muted-foreground")}>
    <div className="grid w-16 shrink-0 text-center leading-tight">
      <span className="text-[11px] font-medium tracking-wide uppercase">{call.startsAt.toLocaleDateString(undefined, { month: "short" })}</span>
      <span className="text-xl font-semibold tabular-nums">{call.startsAt.getDate()}</span>
      <span className="text-[11px]">{call.startsAt.toLocaleDateString(undefined, { weekday: "short" })}</span>
    </div>
    <div className="grid min-w-0 flex-1 gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate font-medium text-foreground">{call.title}</span>
        <Badge variant="outline">{call.cohortName || "Unknown cohort"}</Badge>
        {next && <Badge variant="secondary" className="gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />Next</Badge>}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {call.startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–{callEnd(call).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })} · {call.durationMinutes} min ·{" "}
        <a href={call.joinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">{call.joinUrl.replace(/^https:\/\//, "")}<ExternalLinkIcon className="size-3" /></a>
      </p>
    </div>
    <div className="flex shrink-0 gap-0.5">
      <Button size="icon-sm" variant="ghost" title="Edit call" aria-label={`Edit ${call.title}`} onClick={onEdit}><PencilIcon /></Button>
      <Button size="icon-sm" variant="ghost" className="text-muted-foreground" title="Delete call" aria-label={`Delete ${call.title}`} onClick={onDelete}><Trash2Icon /></Button>
    </div>
  </li>
}

export function LiveCallsPage() {
  const { user } = useAdminAuth()
  const callsQuery = useLiveCallsQuery()
  const cohortsQuery = useCohortsQuery()
  const [view, setView] = useState<"upcoming" | "past">("upcoming")
  const [cohortFilter, setCohortFilter] = useState("all")
  const [editing, setEditing] = useState<LiveCallRecord | "new" | null>(null)
  const [deleting, setDeleting] = useState<LiveCallRecord | null>(null)
  const [now] = useState(() => Date.now())

  const cohorts = useMemo(() => cohortsQuery.data ?? [], [cohortsQuery.data])
  const schedulable = cohorts.filter((cohort) => cohort.status !== "archived")
  // Each cohort's next call still to come (calls are sorted by start).
  const nextIds = new Set<string>()
  const seenCohorts = new Set<string>()
  for (const call of callsQuery.data ?? []) {
    if (callEnd(call).getTime() < now || seenCohorts.has(call.cohortId)) continue
    seenCohorts.add(call.cohortId)
    nextIds.add(call.id)
  }
  const calls = (callsQuery.data ?? []).filter((call) => cohortFilter === "all" || call.cohortId === cohortFilter)
  const upcoming = calls.filter((call) => callEnd(call).getTime() >= now)
  const past = calls.filter((call) => callEnd(call).getTime() < now).reverse()
  const visible = view === "upcoming" ? upcoming : past
  const filterItems = [{ value: "all", label: "All cohorts" }, ...cohorts.map((cohort) => ({ value: cohort.id, label: cohort.name }))]

  const remove = useMutation({
    mutationFn: (call: LiveCallRecord) => {
      if (!user) throw new Error("Your admin session has expired.")
      return deleteLiveCall(call)
    },
    onSuccess: () => { toast.success("Call deleted"); setDeleting(null) },
    onError: (error) => toast.error(error.message),
  })

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Live calls</h1>
        <p className="text-sm text-muted-foreground">Schedule calls for each cohort. On the day of a call, its members see it on Home, with a join button while it's live.</p>
      </div>
      <Button disabled={!schedulable.length} onClick={() => setEditing("new")}><PlusIcon data-icon="inline-start" />Schedule call</Button>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs value={view} onValueChange={(value) => setView(value as "upcoming" | "past")}>
        <TabsList><TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger><TabsTrigger value="past">Past ({past.length})</TabsTrigger></TabsList>
      </Tabs>
      <Select items={filterItems} value={cohortFilter} onValueChange={(value) => value && setCohortFilter(value)}>
        <SelectTrigger className="w-52" aria-label="Filter by cohort"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{filterItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </div>

    {(callsQuery.error || cohortsQuery.error) && <Alert variant="destructive"><AlertTitle>Live calls unavailable</AlertTitle><AlertDescription>{(callsQuery.error ?? cohortsQuery.error)?.message}</AlertDescription></Alert>}
    {callsQuery.isPending && <Skeleton className="h-64 w-full rounded-lg" />}
    {callsQuery.data && (visible.length
      ? <ul className="rounded-lg border bg-card">{visible.map((call) => <CallRow key={call.id} call={call} now={now} next={nextIds.has(call.id)} onEdit={() => setEditing(call)} onDelete={() => setDeleting(call)} />)}</ul>
      : <Empty className="min-h-64 rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><VideoIcon /></EmptyMedia>
            <EmptyTitle>{view === "upcoming" ? "No upcoming calls" : "No past calls"}</EmptyTitle>
            <EmptyDescription>{view === "upcoming" ? "Schedule a call and its cohort's members will see it on Home." : "Calls move here once they've ended."}</EmptyDescription>
          </EmptyHeader>
        </Empty>)}

    <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing === "new" ? "Schedule live call" : "Edit live call"}</DialogTitle></DialogHeader>
        {editing && <CallForm key={editing === "new" ? "new" : editing.id} call={editing === "new" ? null : editing} cohorts={schedulable} onDone={() => setEditing(null)} />}
      </DialogContent>
    </Dialog>

    <Dialog open={!!deleting} onOpenChange={(open) => !open && !remove.isPending && setDeleting(null)}><DialogContent>
      <DialogHeader><DialogTitle>Delete {deleting?.title}?</DialogTitle><DialogDescription>It disappears from {deleting?.cohortName} members' Home screen straight away.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>{remove.isPending && <Spinner />}Delete call</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>
}
