import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { BellIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { useAnnouncementsQuery, useCohortsQuery } from "@/hooks/use-admin-queries"
import {
  accentOptions,
  deleteAnnouncement,
  publishAnnouncement,
  updateAnnouncement,
  type AnnouncementAccent,
  type AnnouncementInput,
  type AnnouncementRecord,
} from "@/lib/announcements"
import { cn } from "@/lib/utils"
import { useSelectedCohort } from "@/hooks/use-selected-cohort"

const emptyInput: AnnouncementInput = { eyebrow: "From your coach", title: "", body: "", cta: "", ctaUrl: "", accent: "rose" }

const inputFor = (item: AnnouncementRecord): AnnouncementInput => ({
  eyebrow: item.eyebrow, title: item.title, body: item.body, cta: item.cta ?? "", ctaUrl: item.ctaUrl ?? "", accent: item.accent,
})

const formatWhen = (date: Date) => date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })

/** The member's card, approximately as the PWA's announcement deck draws it. */
function MemberCardPreview({ input }: { input: AnnouncementInput }) {
  const dark = input.accent === "ink"
  return <div className={cn("relative overflow-hidden rounded-xl border p-4 shadow-sm", dark ? "border-transparent bg-neutral-900 text-white" : "bg-background")}>
    <p className={cn("text-[11px] font-semibold tracking-wide uppercase", dark ? "text-violet-300" : "text-primary")}>{input.eyebrow.trim() || "From your coach"}</p>
    <p className="mt-1.5 text-lg leading-tight font-black">{input.title.trim() || "Your title"}</p>
    <p className={cn("mt-1.5 text-sm whitespace-pre-wrap", dark ? "text-white/70" : "text-muted-foreground")}>{input.body.trim() || "Your message to the cohort."}</p>
    {input.cta.trim() && input.ctaUrl.trim() && <span className={cn("mt-3 inline-flex rounded-full px-4 py-2 text-sm font-semibold", dark ? "bg-primary text-primary-foreground" : "bg-muted")}>{input.cta.trim()}</span>}
  </div>
}

function AnnouncementForm({ cohortId, editing, onDone }: { cohortId: string; editing: AnnouncementRecord | null; onDone: () => void }) {
  const { user } = useAdminAuth()
  const [input, setInput] = useState<AnnouncementInput>(() => editing ? inputFor(editing) : emptyInput)
  const [notify, setNotify] = useState(true)
  const set = (patch: Partial<AnnouncementInput>) => setInput((current) => ({ ...current, ...patch }))
  const mutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Your admin session has expired.")
      return editing ? updateAnnouncement(editing, input, user) : publishAnnouncement({ cohortId, input, notify, user })
    },
    onSuccess: () => {
      toast.success(editing ? "Announcement updated" : notify ? "Announcement posted and members notified" : "Announcement posted")
      setInput(emptyInput)
      onDone()
    },
    onError: (error) => toast.error(error.message),
  })
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate() }
  const busy = mutation.isPending
  const accentItems = accentOptions.map((option) => ({ value: option.value, label: option.label }))

  return <form onSubmit={submit} className="grid gap-4">
    <FieldGroup className="gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
        <Field className="gap-1.5"><FieldLabel htmlFor="ann-eyebrow">Label</FieldLabel><Input id="ann-eyebrow" value={input.eyebrow} maxLength={40} disabled={busy} placeholder="From your coach" onChange={(event) => set({ eyebrow: event.target.value })} /></Field>
        <Field className="gap-1.5"><FieldLabel htmlFor="ann-accent">Style</FieldLabel>
          <Select items={accentItems} value={input.accent} disabled={busy} onValueChange={(value) => value && set({ accent: value as AnnouncementAccent })}>
            <SelectTrigger id="ann-accent" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{accentItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
      </div>
      <Field className="gap-1.5"><FieldLabel htmlFor="ann-title">Title</FieldLabel><Input id="ann-title" value={input.title} maxLength={120} required disabled={busy} placeholder="Week 4 kicks off Progressive Overload" onChange={(event) => set({ title: event.target.value })} /></Field>
      <Field className="gap-1.5"><FieldLabel htmlFor="ann-body">Message</FieldLabel><Textarea id="ann-body" value={input.body} maxLength={1000} required rows={4} disabled={busy} placeholder="Check the newly unlocked guide before your next lower-body session…" onChange={(event) => set({ body: event.target.value })} /></Field>
      <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3">
        <Field className="gap-1.5"><FieldLabel htmlFor="ann-cta">Button <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="ann-cta" value={input.cta} maxLength={30} disabled={busy} placeholder="Open guide" onChange={(event) => set({ cta: event.target.value })} /></Field>
        <Field className="gap-1.5"><FieldLabel htmlFor="ann-url">Button link</FieldLabel><Input id="ann-url" value={input.ctaUrl} disabled={busy} placeholder="https://… or /check-in" onChange={(event) => set({ ctaUrl: event.target.value })} /></Field>
      </div>
      {!editing && <Field orientation="horizontal" className="gap-2">
        <Switch id="ann-notify" checked={notify} disabled={busy} onCheckedChange={setNotify} />
        <div className="grid gap-0.5">
          <FieldLabel htmlFor="ann-notify">Notify members</FieldLabel>
          <FieldDescription className="text-xs">Also posts to the bell inbox. Without it, the card appears quietly in the deck.</FieldDescription>
        </div>
      </Field>}
    </FieldGroup>

    <div className="grid gap-2 rounded-lg border border-dashed bg-muted/40 p-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">What members see · Announcements</p>
      <MemberCardPreview input={input} />
    </div>

    <div className="flex justify-end gap-2">
      {editing && <Button type="button" variant="outline" disabled={busy} onClick={onDone}>Cancel</Button>}
      <Button type="submit" disabled={busy || input.title.trim().length < 2 || input.body.trim().length < 2}>{busy && <Spinner />}{editing ? "Save changes" : "Post"}</Button>
    </div>
  </form>
}

export function AnnouncementsPage() {
  const cohortsQuery = useCohortsQuery()
  const { cohort } = useSelectedCohort()
  const announcementsQuery = useAnnouncementsQuery(cohort?.id ?? "")
  const [editingState, setEditing] = useState<AnnouncementRecord | null>(null)
  // Switching cohorts in the header drops an edit that belongs to the previous one.
  const editing = editingState?.cohortId === cohort?.id ? editingState : null
  const [deleting, setDeleting] = useState<AnnouncementRecord | null>(null)

  const remove = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => { toast.success("Announcement deleted"); setDeleting(null) },
    onError: (error) => toast.error(error.message),
  })

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Announcements</h1>
        <p className="text-sm text-muted-foreground">Cards on your cohort's "What's new this week" deck in the member app, newest first. Turn on Notify to also ring their bell.</p>
      </div>
    </header>

    {(cohortsQuery.error || announcementsQuery.error) && <Alert variant="destructive"><AlertTitle>Announcements unavailable</AlertTitle><AlertDescription>{(cohortsQuery.error ?? announcementsQuery.error)?.message}</AlertDescription></Alert>}
    {cohortsQuery.isPending && <Skeleton className="h-96 w-full rounded-lg" />}
    {!cohortsQuery.isPending && !cohort && <p className="text-sm text-muted-foreground">Create a cohort first; announcements are posted to a cohort's members.</p>}

    {cohort && <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Card size="sm" className="rounded-lg">
        <CardHeader>
          <CardTitle>{editing ? "Edit announcement" : "New announcement"}</CardTitle>
          <CardDescription>To {cohort.name}{editing ? `, posted ${formatWhen(editing.publishedAt)}` : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          <AnnouncementForm key={`${cohort.id}:${editing?.id ?? "new"}`} cohortId={cohort.id} editing={editing} onDone={() => setEditing(null)} />
        </CardContent>
      </Card>

      <Card size="sm" className="rounded-lg">
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Members see the newest 20.</CardDescription>
        </CardHeader>
        <CardContent>
          {announcementsQuery.isPending ? <Skeleton className="h-40 w-full" />
            : !announcementsQuery.data?.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nothing posted to {cohort.name} yet.</p>
            : <ul className="grid">
                {announcementsQuery.data.map((item, index) => <li key={item.id} className={cn("group/item grid gap-1 py-3", index > 0 && "border-t", editing?.id === item.id && "rounded-md bg-muted/60 px-2")}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{formatWhen(item.publishedAt)}</span>
                    {item.notificationId && <BellIcon className="size-3.5 text-muted-foreground" aria-label="Members were notified" />}
                    {index >= 20 && <Badge variant="outline">Not shown</Badge>}
                    <div className="ml-auto flex gap-0.5 opacity-60 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100">
                      <Button size="icon-sm" variant="ghost" title="Edit" aria-label={`Edit ${item.title}`} onClick={() => setEditing(item)}><PencilIcon /></Button>
                      <Button size="icon-sm" variant="ghost" className="text-muted-foreground" title="Delete" aria-label={`Delete ${item.title}`} onClick={() => setDeleting(item)}><Trash2Icon /></Button>
                    </div>
                  </div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{item.body}</p>
                </li>)}
              </ul>}
        </CardContent>
      </Card>
    </div>}

    <Dialog open={!!deleting} onOpenChange={(open) => !open && !remove.isPending && setDeleting(null)}><DialogContent>
      <DialogHeader><DialogTitle>Delete "{deleting?.title}"?</DialogTitle><DialogDescription>It disappears from members' announcement deck{deleting?.notificationId ? ", along with its bell notification" : ""}.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>{remove.isPending && <Spinner />}Delete</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>
}
