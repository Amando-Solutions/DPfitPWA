import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { ArchiveRestoreIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { ExerciseTypeSelect, NewExerciseDialog } from "@/components/new-exercise-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { useExerciseLibraryQuery } from "@/hooks/use-admin-queries"
import {
  removeLibraryExercise,
  setLibraryExerciseArchived,
  updateLibraryExercise,
  type LibraryExercise,
  type LibraryExerciseInput,
} from "@/lib/exercise-library"
import { cn } from "@/lib/utils"

const rowGrid = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.8fr)_5.5rem_2rem] items-center gap-2"
const headLabel = "text-[11px] font-medium tracking-wide text-muted-foreground uppercase"

function VideoStatus({ url }: { url: string | null }) {
  return url
    ? <Badge variant="secondary" className="gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />Added</Badge>
    : <Badge variant="outline" className="gap-1.5 text-destructive"><span className="size-1.5 rounded-full bg-destructive" aria-hidden />Missing</Badge>
}

// Each row edits in place and saves on blur/Enter; a rename or video change syncs to every program.
function LibraryRow({ exercise, onRemove }: { exercise: LibraryExercise; onRemove: (exercise: LibraryExercise) => void }) {
  const { user } = useAdminAuth()
  const saved: LibraryExerciseInput = { name: exercise.name, defaultType: exercise.defaultType, muscleGroup: exercise.muscleGroup, videoUrl: exercise.videoUrl ?? "" }
  const [draft, setDraft] = useState(saved)
  const save = useMutation({
    mutationFn: (next: LibraryExerciseInput) => {
      if (!user) throw new Error("Your admin session has expired.")
      return updateLibraryExercise(exercise, next, user)
    },
    onSuccess: ({ placementsUpdated }) => {
      toast.success(placementsUpdated ? `${exercise.name} updated in ${placementsUpdated} placement${placementsUpdated === 1 ? "" : "s"}` : "Exercise saved")
    },
    onError: (error) => { toast.error(error.message); setDraft(saved) },
  })
  const restore = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Your admin session has expired.")
      return setLibraryExerciseArchived(exercise, false, user)
    },
    onSuccess: () => toast.success(`${exercise.name} restored`),
    onError: (error) => toast.error(error.message),
  })
  function commit(next: LibraryExerciseInput = draft) {
    const changed = next.name.trim() !== saved.name || next.defaultType !== saved.defaultType
      || next.muscleGroup.trim() !== saved.muscleGroup || next.videoUrl.trim() !== saved.videoUrl
    if (changed && !save.isPending) save.mutate(next)
  }
  const onEnter = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") event.currentTarget.blur() }
  const busy = save.isPending || restore.isPending
  const label = exercise.name

  return <div className={cn(rowGrid, "border-t px-3 py-2", exercise.archived && "opacity-60")}>
    <Input aria-label={`${label} name`} value={draft.name} maxLength={80} disabled={busy || exercise.archived} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onBlur={() => commit()} onKeyDown={onEnter} />
    <ExerciseTypeSelect value={draft.defaultType} disabled={busy || exercise.archived} className="w-full min-w-0" onChange={(defaultType) => { const next = { ...draft, defaultType }; setDraft(next); commit(next) }} />
    <Input aria-label={`${label} muscle group`} value={draft.muscleGroup} maxLength={40} placeholder="—" disabled={busy || exercise.archived} onChange={(event) => setDraft({ ...draft, muscleGroup: event.target.value })} onBlur={() => commit()} onKeyDown={onEnter} />
    <InputGroup>
      <InputGroupInput aria-label={`${label} video link`} type="url" value={draft.videoUrl} placeholder="https://…/clip.mp4" disabled={busy || exercise.archived} onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })} onBlur={() => commit()} onKeyDown={onEnter} />
      {save.isPending && <InputGroupAddon align="inline-end"><Spinner /></InputGroupAddon>}
    </InputGroup>
    <div>{exercise.archived ? <Badge variant="outline">Archived</Badge> : <VideoStatus url={exercise.videoUrl} />}</div>
    {exercise.archived
      ? <Button size="icon-sm" variant="ghost" title="Restore" aria-label={`Restore ${label}`} disabled={busy} onClick={() => restore.mutate()}><ArchiveRestoreIcon /></Button>
      : <Button size="icon-sm" variant="ghost" className="text-muted-foreground" title="Remove" aria-label={`Remove ${label}`} disabled={busy} onClick={() => onRemove(exercise)}><Trash2Icon /></Button>}
  </div>
}

export function ExerciseLibraryPage() {
  const { user } = useAdminAuth()
  const query = useExerciseLibraryQuery()
  const [search, setSearch] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<LibraryExercise | null>(null)
  const exercises = useMemo(() => query.data ?? [], [query.data])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return exercises.filter((exercise) => (showArchived || !exercise.archived)
      && (!term || `${exercise.name} ${exercise.muscleGroup}`.toLowerCase().includes(term)))
  }, [exercises, search, showArchived])
  const active = exercises.filter((exercise) => !exercise.archived)
  const missing = active.filter((exercise) => !exercise.videoUrl).length
  const archivedCount = exercises.length - active.length

  const remove = useMutation({
    mutationFn: (exercise: LibraryExercise) => {
      if (!user) throw new Error("Your admin session has expired.")
      return removeLibraryExercise(exercise, user)
    },
    onSuccess: (result, exercise) => {
      toast.success(result === "archived" ? `${exercise.name} is used in programs, so it was archived` : `${exercise.name} deleted`)
      setRemoving(null)
    },
    onError: (error) => toast.error(error.message),
  })

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Exercise library</h1>
        <p className="text-sm text-muted-foreground">One shared list for every program's training days. A video link here reaches every placement of the exercise — use a direct video file (MP4); YouTube, Vimeo and Drive pages won't play in the app.</p>
      </div>
      <Button onClick={() => setAdding(true)}><PlusIcon data-icon="inline-start" />Add exercise</Button>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <InputGroup className="max-w-sm">
        <InputGroupAddon><SearchIcon /></InputGroupAddon>
        <InputGroupInput aria-label="Search exercises" placeholder="Search exercises..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </InputGroup>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {query.data && <span>{active.length} exercises · {missing} missing video</span>}
        {archivedCount > 0 && <Field orientation="horizontal" className="w-auto gap-2"><Switch id="show-archived" size="sm" checked={showArchived} onCheckedChange={setShowArchived} /><FieldLabel htmlFor="show-archived" className="font-normal">Show archived ({archivedCount})</FieldLabel></Field>}
      </div>
    </div>

    {query.error && <Alert variant="destructive"><AlertTitle>Library unavailable</AlertTitle><AlertDescription>{query.error.message}</AlertDescription></Alert>}
    {query.isPending && <Skeleton className="h-96 w-full rounded-lg" />}
    {query.data && <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="min-w-[56rem]">
        <div className={cn(rowGrid, headLabel, "px-3 py-2.5")}><span>Exercise</span><span>Default type</span><span>Muscle group</span><span>Video link</span><span>Status</span></div>
        {visible.map((exercise) => <LibraryRow key={`${exercise.id}:${exercise.name}:${exercise.videoUrl}:${exercise.muscleGroup}:${exercise.defaultType}:${exercise.archived}`} exercise={exercise} onRemove={setRemoving} />)}
        {!visible.length && <p className="border-t px-3 py-10 text-center text-sm text-muted-foreground">{exercises.length ? "No exercises match your search." : "The library is empty. Add the first exercise."}</p>}
      </div>
    </div>}

    <NewExerciseDialog open={adding} onOpenChange={setAdding} />

    <Dialog open={!!removing} onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}><DialogContent>
      <DialogHeader><DialogTitle>Remove {removing?.name}?</DialogTitle><DialogDescription>If any program uses this exercise it's archived instead: hidden from the Training Days picker, while existing placements keep their name and video. Otherwise it's deleted.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={remove.isPending} onClick={() => setRemoving(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => removing && remove.mutate(removing)}>{remove.isPending && <Spinner />}Remove</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>
}
