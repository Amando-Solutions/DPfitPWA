import { useState, type FormEvent, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { usePlatformSettingsQuery, usePublicSettingsQuery } from "@/hooks/use-admin-queries"
import { useSelectedCohort } from "@/hooks/use-selected-cohort"
import { cohortOver, cohortZone, dayIn, formatDayKey, lastDayOf, lastDayOfCohort, startOfDay, zoneLabel } from "@/lib/cohort-calendar"
import { cohortInProgress, type CohortRecord } from "@/lib/cohorts"
import { programPhases } from "@/lib/cohort-pulse"
import { saveCohortLastDay, saveCohortStartDate, savePlatformSettings, savePublicSettings, type PlatformSettings, type PublicSettings } from "@/lib/platform-settings"

const DAY_MS = 24 * 60 * 60 * 1000
const labelClass = "text-[11px] font-medium tracking-wide text-muted-foreground uppercase"

function SettingsCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return <Card size="sm" className={`rounded-lg ${className ?? ""}`}>
    <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
    <CardContent className="grid gap-4">{children}</CardContent>
  </Card>
}

const Note = ({ children }: { children: ReactNode }) => <p className="rounded-md bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">{children}</p>

type AdminUser = ReturnType<typeof useAdminAuth>["user"]

function ChallengeTiming() {
  const { user } = useAdminAuth()
  const { cohort, program, isPending } = useSelectedCohort()
  if (isPending) return <SettingsCard title="Challenge timing"><Skeleton className="h-24" /></SettingsCard>
  if (!cohort) return <SettingsCard title="Challenge timing"><Note>Create a cohort first; the challenge counts from its start date.</Note></SettingsCard>
  return <SettingsCard title="Challenge timing">
    <StartDateForm key={`${cohort.id}:${cohort.startDate.getTime()}`} cohort={cohort} phases={programPhases(program, cohort.durationWeeks)} user={user} />
    <LastDayForm key={`${cohort.id}:${cohort.endDate?.getTime() ?? "none"}`} cohort={cohort} user={user} />
  </SettingsCard>
}

function StartDateForm({ cohort, phases, user }: { cohort: CohortRecord; phases: ReturnType<typeof programPhases>; user: AdminUser }) {
  const zone = cohortZone(cohort.timezone)
  const saved = dayIn(cohort.startDate, zone)
  const [value, setValue] = useState(saved)
  const [confirming, setConfirming] = useState(false)
  const [now] = useState(() => Date.now())
  const mutation = useMutation({
    mutationFn: () => { if (!user) throw new Error("Your admin session has expired."); return saveCohortStartDate(cohort, value, user) },
    onSuccess: () => { toast.success(`${cohort.name} now starts ${formatDayKey(value)}`); setConfirming(false) },
    onError: (error) => toast.error(error.message),
  })

  // Preview what the chosen date means today.
  const start = startOfDay(value, zone).getTime()
  const days = Number.isNaN(start) ? null : Math.floor((now - start) / DAY_MS)
  const week = days === null ? 0 : Math.floor(days / 7) + 1
  const phase = phases.find((item) => week >= item.fromWeek && week <= item.toWeek)
  const summary = days === null ? "Choose a date."
    : days < 0 ? <>Starts in {-days} day{days === -1 ? "" : "s"}. Members see a countdown until then.</>
    : week > cohort.durationWeeks ? <>{days} days since start → the {cohort.durationWeeks}-week challenge is <strong className="text-foreground">complete</strong>.</>
    : <>{days} day{days === 1 ? "" : "s"} since start → currently <strong className="text-foreground">Week {week}</strong>{phase && !phase.title.startsWith("Week ") ? <>, <strong className="text-foreground">{phase.title}</strong> phase</> : null}.</>
  const live = cohort.startDate.getTime() <= now || cohort.memberCount > 0

  return <form className="grid gap-4" onSubmit={(event: FormEvent) => { event.preventDefault(); if (live) setConfirming(true); else mutation.mutate() }}>
    <Field className="gap-1.5">
      <FieldLabel htmlFor="start-date" className={labelClass}>Challenge start date</FieldLabel>
      <div className="flex gap-2">
        <Input id="start-date" type="date" required value={value} disabled={mutation.isPending} onChange={(event) => setValue(event.target.value)} />
        <Button type="submit" disabled={mutation.isPending || !value || value === saved}>{mutation.isPending && <Spinner />}Save</Button>
      </div>
      <FieldDescription className="text-xs">{cohort.name}'s {cohort.durationWeeks} weeks count from this date (midnight, {zoneLabel(zone)}). The landing page's start badge reads it too. Moving it moves the last day as well, to the end of week {cohort.durationWeeks}.</FieldDescription>
    </Field>
    <Note>{summary}</Note>

    <Dialog open={confirming} onOpenChange={(open) => !open && !mutation.isPending && setConfirming(false)}><DialogContent>
      <DialogHeader>
        <DialogTitle>Move {cohort.name}'s start date?</DialogTitle>
        <DialogDescription>Every member's current week, phase, check-in week and leaderboard reveal are counted from this date, so they all shift together. Sessions and check-ins already logged keep the week they were logged in. The last day moves to {formatDayKey(lastDayOf(value, cohort.durationWeeks))}.</DialogDescription>
      </DialogHeader>
      <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setConfirming(false)}>Cancel</Button><Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending && <Spinner />}Move start date</Button></DialogFooter>
    </DialogContent></Dialog>
  </form>
}

/**
 * The cohort's last day. It runs to the end of it and closes at the midnight
 * after, in its zone; from then its members get only "Your cohort has ended".
 * Moving it later reopens a cohort that ended this way.
 */
function LastDayForm({ cohort, user }: { cohort: CohortRecord; user: AdminUser }) {
  const zone = cohortZone(cohort.timezone)
  const [now] = useState(() => new Date())
  const today = dayIn(now, zone)
  const startDay = dayIn(cohort.startDate, zone)
  const saved = lastDayOfCohort(cohort) ?? ""
  const [value, setValue] = useState(saved)
  const [confirming, setConfirming] = useState(false)
  const endedNow = cohortOver(cohort, now)
  const endsOnSave = value !== "" && value < today
  const mutation = useMutation({
    mutationFn: () => { if (!user) throw new Error("Your admin session has expired."); return saveCohortLastDay(cohort, value, user) },
    onSuccess: () => { toast.success(`${cohort.name}'s last day is now ${formatDayKey(value)}`); setConfirming(false) },
    onError: (error) => toast.error(error.message),
  })

  const summary = !value ? "No last day is set, so the cohort only ends when it's archived."
    : value < today ? <>That day has passed, so the cohort is <strong className="text-foreground">over</strong>: members see "Your cohort has ended" and can't train, check in or chat.</>
    : value === today ? <>Today is the last day. Members are in until midnight, {zoneLabel(zone)}.</>
    : <>Members are in until the end of {formatDayKey(value)}, then see "Your cohort has ended".</>

  const consequence = endsOnSave && !endedNow
    ? <>That day has already passed, so {cohort.name} ends for its members as soon as you save. They move to "Your cohort has ended", with their totals, and can't train, check in or chat.</>
    : endedNow && !endsOnSave
      ? <>{cohort.name} reopens: its members go back into the app straight away and can train, check in and chat until the end of {formatDayKey(value)}.</>
      : <>Members are in until the end of {formatDayKey(value)}, {zoneLabel(zone)}. The program's weeks don't move.</>

  return <form className="grid gap-4 border-t pt-4" onSubmit={(event: FormEvent) => { event.preventDefault(); setConfirming(true) }}>
    <Field className="gap-1.5">
      <FieldLabel htmlFor="last-day" className={labelClass}>Last day</FieldLabel>
      <div className="flex gap-2">
        <Input id="last-day" type="date" required min={startDay} value={value} disabled={mutation.isPending} onChange={(event) => setValue(event.target.value)} />
        <Button type="submit" disabled={mutation.isPending || !value || value === saved || value < startDay}>{mutation.isPending && <Spinner />}Save</Button>
      </div>
      <FieldDescription className="text-xs">The cohort runs to the end of this day and closes at the midnight after it, {zoneLabel(zone)}. Members can still sign in and see their totals.</FieldDescription>
    </Field>
    <Note>{summary}</Note>

    <Dialog open={confirming} onOpenChange={(open) => !open && !mutation.isPending && setConfirming(false)}><DialogContent>
      <DialogHeader>
        <DialogTitle>{endsOnSave && !endedNow ? `End ${cohort.name} now?` : `Change ${cohort.name}'s last day?`}</DialogTitle>
        <DialogDescription>{consequence}</DialogDescription>
      </DialogHeader>
      <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setConfirming(false)}>Cancel</Button><Button variant={endsOnSave && !endedNow ? "destructive" : "default"} disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending && <Spinner />}{endsOnSave && !endedNow ? "End the cohort" : "Save last day"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </form>
}

function CoachDetails({ settings }: { settings: PublicSettings }) {
  const { user } = useAdminAuth()
  const [name, setName] = useState(settings.coachName)
  const [whatsapp, setWhatsapp] = useState(settings.coachWhatsapp)
  const mutation = useMutation({ mutationFn: savePublicSettings, onSuccess: () => toast.success("Coach details saved"), onError: (error) => toast.error(error.message) })
  const dirty = name !== settings.coachName || whatsapp !== settings.coachWhatsapp
  const shownName = name.trim() || "your coach"
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (user) mutation.mutate({ coachName: name, coachWhatsapp: whatsapp, user }) }}>
    <Field className="gap-1.5"><FieldLabel htmlFor="coach-name" className={labelClass}>Display name</FieldLabel><Input id="coach-name" value={name} maxLength={80} placeholder="Bola" disabled={mutation.isPending} onChange={(event) => setName(event.target.value)} /></Field>
    <Field className="gap-1.5"><FieldLabel htmlFor="coach-whatsapp" className={labelClass}>WhatsApp contact</FieldLabel><Input id="coach-whatsapp" type="tel" value={whatsapp} maxLength={30} placeholder="+234 812 345 6789" disabled={mutation.isPending} onChange={(event) => setWhatsapp(event.target.value)} /></Field>
    <Note>{whatsapp.trim()
      ? <>Shown to anyone whose access code doesn't work: <em>"That code isn't valid — check it and try again, or message {shownName} on WhatsApp."</em></>
      : "Add a WhatsApp number to offer it on the member app's access-code screen when a code doesn't work."}</Note>
    <Button type="submit" className="w-fit" disabled={mutation.isPending || !dirty}>{mutation.isPending && <Spinner />}Save coach details</Button>
  </form>
}

function IntegritySettings({ settings }: { settings: PlatformSettings }) {
  const { user } = useAdminAuth()
  const [value, setValue] = useState(String(settings.qualifyingSetPercent))
  const mutation = useMutation({ mutationFn: savePlatformSettings, onSuccess: () => toast.success("Platform settings saved"), onError: (error) => toast.error(error.message) })
  function submit(event: FormEvent) {
    event.preventDefault()
    if (user) mutation.mutate({ ...settings, qualifyingSetPercent: Number(value), user })
  }
  return <form onSubmit={submit}>
    <FieldGroup className="gap-4">
      <Field className="gap-1.5">
        <FieldLabel htmlFor="qualification" className={labelClass}>Workout qualification threshold (%)</FieldLabel>
        <div className="flex gap-2">
          <Input id="qualification" type="number" min={1} max={100} step={1} value={value} onChange={(event) => setValue(event.target.value)} disabled={mutation.isPending} required className="max-w-32" />
          <Button type="submit" disabled={mutation.isPending || value === String(settings.qualifyingSetPercent)}>{mutation.isPending && <Spinner />}Save</Button>
        </div>
        <FieldDescription className="text-xs">Share of prescribed sets a workout needs to count. Applies to future workout submissions across every program; earlier qualification and rewards stay unchanged.</FieldDescription>
      </Field>
    </FieldGroup>
  </form>
}

function CodeIssuance({ settings }: { settings: PlatformSettings }) {
  const { user } = useAdminAuth()
  const mutation = useMutation({
    mutationFn: savePlatformSettings,
    onSuccess: (_, input) => toast.success(input.autoIssueCodes ? "Automatic code issuance is on" : "Automatic code issuance is paused"),
    onError: (error) => toast.error(error.message),
  })
  const on = mutation.isPending ? !!mutation.variables?.autoIssueCodes : settings.autoIssueCodes
  return <>
    <div className="flex items-center justify-between gap-4 border-b pb-4">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">Selar → Zapier automatic issuance</p>
        <p className="text-xs text-muted-foreground">{on ? "On — a code is issued and emailed the moment someone pays through Selar." : "Paused — Selar payments are refused until you turn this back on."}</p>
      </div>
      <Switch checked={on} disabled={mutation.isPending || !user} aria-label="Automatic code issuance" onCheckedChange={(checked) => user && mutation.mutate({ ...settings, autoIssueCodes: checked, user })} />
    </div>
    <Note>When paused, sales are rejected with a clear error, not silently dropped. Zapier keeps each one as a failed task, so replay them once this is back on and every buyer gets their code.</Note>
  </>
}

/**
 * How cohorts run, stated rather than switched. There used to be a toggle here
 * for several cohorts running at once; one at a time is now the rule, kept by
 * the cohort screens and the `completeCohorts` function.
 */
function CohortRules() {
  const { cohorts } = useSelectedCohort()
  const [now] = useState(() => new Date())
  const running = cohorts.find((cohort) => cohortInProgress(cohort, now))
  return <>
    <div className="grid gap-0.5 border-b pb-4">
      <p className="text-sm font-medium">One cohort at a time</p>
      <p className="text-xs text-muted-foreground">{running ? <>Running now: <strong className="text-foreground">{running.name}</strong>.</> : "No cohort is running right now."}</p>
    </div>
    <Note>No two cohorts’ dates can overlap. A cohort made while another runs starts as a draft, and can be activated once that one has ended or been archived. A cohort becomes completed when its last day passes. Members who join another cohort stay in the old one’s results, and the header’s cohort picker opens any cohort’s.</Note>
  </>
}

const unavailable = [
  { title: "Passwords or account recovery", description: "Devices stay signed in; there's no self-serve login recovery." },
  { title: "Native mobile app", description: "Web app only; it installs from, and works fine in, a phone browser." },
]

export function SettingsPage() {
  const platform = usePlatformSettingsQuery()
  const publicSettings = usePublicSettingsQuery()
  const error = platform.error ?? publicSettings.error
  return <div className="flex min-w-0 flex-col gap-5">
    <header className="grid gap-1">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">The few global controls that drive the rest of the platform.</p>
    </header>
    {error && <Alert variant="destructive"><AlertTitle>Settings unavailable</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}

    {/* Two independent columns balanced by height, so a tall card never leaves a gap beside a short one. */}
    <div className="grid max-w-5xl items-start gap-4 lg:grid-cols-2">
      <div className="grid gap-4">
        <ChallengeTiming />
        <SettingsCard title="Workout integrity">
          {platform.data ? <IntegritySettings key={platform.data.qualifyingSetPercent} settings={platform.data} /> : <Skeleton className="h-24" />}
        </SettingsCard>
        <SettingsCard title="Cohorts">
          <CohortRules />
        </SettingsCard>
      </div>
      <div className="grid gap-4">
        <SettingsCard title="Coach details">
          {publicSettings.data ? <CoachDetails key={`${publicSettings.data.coachName}|${publicSettings.data.coachWhatsapp}`} settings={publicSettings.data} /> : <Skeleton className="h-48" />}
        </SettingsCard>
        <SettingsCard title="Automatic code issuance">
          {platform.data ? <CodeIssuance settings={platform.data} /> : <Skeleton className="h-24" />}
        </SettingsCard>
      </div>
      <SettingsCard title="Not available in this version" className="lg:col-span-2">
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {unavailable.map((item) => <li key={item.title} className="flex items-center justify-between gap-4">
            <div className="grid gap-0.5"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.description}</p></div>
            <Switch checked={false} disabled aria-label={`${item.title} (not available)`} />
          </li>)}
        </ul>
      </SettingsCard>
    </div>
  </div>
}
