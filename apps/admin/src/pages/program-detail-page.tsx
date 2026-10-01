import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeftIcon, CopyPlusIcon, PencilIcon, SendIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GuidesPanel, RewardsPanel, WeekThemesPanel } from "@/components/program-authoring"
import { features } from "@/lib/features"
import { ProgramStats } from "@/components/program-stats"
import { ProgramWeekEditor } from "@/components/program-week-editor"
import { useProgramQuery, useProgramWeeksQuery, useProgramWorkoutDaysQuery } from "@/hooks/use-admin-queries"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { cloneProgramVersion, deleteProgramDraft, publishProgram, updateProgramDetails, type ProgramRecord } from "@/lib/programs"

function ProgramDetailsForm({ program, onClose }: { program: ProgramRecord; onClose: () => void }) {
  const { user } = useAdminAuth()
  const [name, setName] = useState(program.name)
  const [weeks, setWeeks] = useState(String(program.totalWeeks))
  const [sessions, setSessions] = useState(String(program.sessionsPerWeek))
  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Your admin session has expired.")
      await updateProgramDetails({ program, name, totalWeeks: Number(weeks), sessionsPerWeek: Number(sessions), user })
    },
    onSuccess: () => { toast.success("Program details saved"); onClose() },
    onError: (error) => toast.error(error.message),
  })
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate() }
  return <form className="contents" onSubmit={submit}>
    <DialogHeader><DialogTitle>Edit program details</DialogTitle></DialogHeader>
    <FieldGroup>
      <Field><FieldLabel htmlFor="program-name">Name</FieldLabel><Input id="program-name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} disabled={mutation.isPending} /></Field>
      <Field><FieldLabel htmlFor="program-weeks">Weeks</FieldLabel><Input id="program-weeks" type="number" value={weeks} min={1} max={52} onChange={(event) => setWeeks(event.target.value)} required disabled={mutation.isPending} /></Field>
      <Field><FieldLabel htmlFor="program-sessions">Sessions per week</FieldLabel><Input id="program-sessions" type="number" value={sessions} min={1} max={7} onChange={(event) => setSessions(event.target.value)} required disabled={mutation.isPending} /></Field>
    </FieldGroup>
    <DialogFooter><Button variant="outline" type="button" disabled={mutation.isPending} onClick={onClose}>Cancel</Button><Button disabled={mutation.isPending}>{mutation.isPending && <Spinner />}Save changes</Button></DialogFooter>
  </form>
}

export function ProgramDetailPage() {
  const { programId = "" } = useParams()
  const navigate = useNavigate()
  const { user } = useAdminAuth()
  const programQuery = useProgramQuery(programId)
  const daysQuery = useProgramWorkoutDaysQuery(programId)
  const weeksQuery = useProgramWeeksQuery(programId)
  const program = programQuery.data
  const [editOpen, setEditOpen] = useState(false)
  const [action, setAction] = useState<"publish" | "clone" | "delete" | null>(null)
  const [dirty, setDirty] = useState(false)
  const mutation = useMutation({
    mutationFn: async () => {
      if (!program || !user) throw new Error("Your admin session has expired.")
      if (action === "publish") { await publishProgram(program, user); return null }
      if (action === "delete") { await deleteProgramDraft(program); return "/programs" }
      const result = await cloneProgramVersion(program)
      return `/programs/${result.programId}`
    },
    onSuccess: (path) => { toast.success(action === "publish" ? "Program published" : action === "delete" ? "Draft deleted" : "New version created"); setAction(null); if (path) void navigate(path) },
    onError: (error) => toast.error(error.message),
  })
  const error = programQuery.error ?? daysQuery.error ?? weeksQuery.error
  const ready = !!program && !!daysQuery.data && !!weeksQuery.data
  return <div className="flex min-w-0 flex-1 flex-col gap-6">
    <Button className="w-fit" variant="ghost" render={<Link to="/programs" />}><ArrowLeftIcon data-icon="inline-start" />Back to programs</Button>
    {error && <Alert variant="destructive"><AlertTitle>Program unavailable</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}
    {programQuery.isPending && <Skeleton className="h-24 w-full" />}
    {programQuery.isSuccess && !program && <p>Program not found.</p>}
    {program && <>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="grid min-w-0 gap-2"><div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-semibold">{program.name}</h1><Badge variant="outline">v{program.version}</Badge><Badge variant="secondary">{program.status}</Badge></div></div>
        <div className="flex flex-wrap gap-2">
          {program.status === "draft" && <>
            <Button variant="ghost" disabled={dirty} onClick={() => setAction("delete")}><Trash2Icon data-icon="inline-start" />Delete draft</Button>
            <Button variant="outline" disabled={dirty} onClick={() => setEditOpen(true)}><PencilIcon data-icon="inline-start" />Edit details</Button>
            <Button disabled={dirty || !ready || !program.workoutDayCount || !program.weekThemesConfigured || !program.rewardsConfigured} onClick={() => setAction("publish")}><SendIcon data-icon="inline-start" />Publish</Button>
          </>}
          {program.status === "published" && <Button variant="outline" disabled={dirty} onClick={() => setAction("clone")}><CopyPlusIcon data-icon="inline-start" />Create new version</Button>}
        </div>
      </header>
      <ProgramStats program={program} weeks={weeksQuery.data} legacyDays={daysQuery.data} />
      <Tabs defaultValue="schedule">
        <TabsList variant="line"><TabsTrigger value="schedule">Training</TabsTrigger><TabsTrigger value="themes">Week themes</TabsTrigger>{features.programRewards && <TabsTrigger value="rewards">Rewards</TabsTrigger>}<TabsTrigger value="guides">Guides</TabsTrigger></TabsList>
        <TabsContent value="schedule" className="pt-5" keepMounted>
          {ready ? <ProgramWeekEditor key={programId} program={program} weeks={weeksQuery.data!} legacyDays={daysQuery.data!} onDirtyChange={setDirty} /> : !error && <Skeleton className="h-96 w-full" />}
        </TabsContent>
        <TabsContent value="themes" className="pt-5"><WeekThemesPanel program={program} user={user} /></TabsContent>
        {features.programRewards && <TabsContent value="rewards" className="pt-5"><RewardsPanel program={program} user={user} /></TabsContent>}
        <TabsContent value="guides" className="pt-5"><GuidesPanel program={program} user={user} /></TabsContent>
      </Tabs>
      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent><ProgramDetailsForm key={String(editOpen)} program={program} onClose={() => setEditOpen(false)} /></DialogContent></Dialog>
      <Dialog open={action !== null} onOpenChange={(open) => !open && !mutation.isPending && setAction(null)}><DialogContent>
        <DialogHeader><DialogTitle>{action === "publish" ? "Publish program?" : action === "delete" ? "Delete draft?" : "Create new version?"}</DialogTitle><DialogDescription>{action === "publish" ? "This version becomes available for cohort assignment and cannot be edited after publishing." : action === "delete" ? "The draft and its weekly plans, workout days, and guides will be permanently removed." : "Copy this program, including all weekly schedules, into an editable draft."}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setAction(null)}>Cancel</Button><Button variant={action === "delete" ? "destructive" : "default"} disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending && <Spinner />}{action === "publish" ? "Publish program" : action === "delete" ? "Delete draft" : "Create version"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </>}
  </div>
}
