import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { CopyIcon, ImageIcon, PlusIcon, Settings2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox, ComboboxInput, ComboboxContent, ComboboxEmpty, ComboboxList, ComboboxItem } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { useExerciseLibraryQuery } from "@/hooks/use-admin-queries"
import { NewExerciseDialog } from "@/components/new-exercise-dialog"
import { exerciseNameKey, type LibraryExercise } from "@/lib/exercise-library"
import { exerciseTypes, exerciseTypeOf, exerciseTypeFields, sectionOf, workoutNames, type ExerciseSection } from "@/lib/exercise-types"
import { activeExercises, matchingWeek, resolveWeek, sameDayStructure, type ProgramWeek } from "@/lib/program-week-model"
import { saveProgramWeeks } from "@/lib/program-weeks"
import type { ProgramRecord, ProgramWorkoutDay, ProgramExercise } from "@/lib/programs"
import { uploadProgramHero } from "@/lib/program-images"
import { cn } from "@/lib/utils"

function NamePicker({ value, options, label, disabled, onChange }: { value: string; options: string[]; label: string; disabled: boolean; onChange: (value: string) => void }) {
  return <Combobox items={options} value={value || null} onValueChange={(next) => next && onChange(next)} disabled={disabled}>
    <ComboboxInput aria-label={label} placeholder="Select..." className="w-full min-w-0" />
    <ComboboxContent><ComboboxEmpty>No matching exercises.</ComboboxEmpty><ComboboxList>{(item: string) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList></ComboboxContent>
  </Combobox>
}

const exerciseGrid = "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_3rem_minmax(0,1.4fr)_1.75rem] items-center gap-2"

// "Weight (kg)" -> "kg", "Reps" -> "reps"
function unitOf(label: string) {
  return label.match(/\(([^)]+)\)/)?.[1] ?? label.toLowerCase()
}

function TargetInputs({ exercise, disabled, onChange }: { exercise: ProgramExercise; disabled: boolean; onChange: (patch: Partial<ProgramExercise>) => void }) {
  const fields = exerciseTypeFields(exercise.exerciseType)
  const name = exercise.name || "exercise"
  return <InputGroup title={fields.first ? `${fields.first} × ${fields.second}` : fields.second}>
    {fields.first && <>
      <InputGroupInput aria-label={`${name} ${fields.first}`} className="min-w-0" value={exercise.targetValue ?? ""} disabled={disabled} placeholder="–" onChange={(event) => onChange({ targetValue: event.target.value })} />
      <InputGroupText className="px-0 text-xs">{unitOf(fields.first)} ×</InputGroupText>
    </>}
    <InputGroupInput aria-label={`${name} ${fields.second}`} className="min-w-0" value={exercise.targetSecondary ?? exercise.targetReps} disabled={disabled} placeholder={fields.secondKey === "reps" ? "8-10" : "60"} onChange={(event) => onChange({ targetSecondary: event.target.value, targetReps: event.target.value })} />
    <InputGroupAddon align="inline-end" className="text-xs">{unitOf(fields.second)}</InputGroupAddon>
  </InputGroup>
}

// Searchable picker over the shared library, with an inline "+ Add" when nothing matches.
function ExercisePicker({ exercise, library, disabled, onPick, onAddNew }: { exercise: ProgramExercise; library: LibraryExercise[]; disabled: boolean; onPick: (entry: LibraryExercise) => void; onAddNew: (name: string) => void }) {
  const [query, setQuery] = useState("")
  // Keep an unlinked or archived placement's name selectable so it still displays.
  const names = useMemo(() => {
    const active = library.filter((entry) => !entry.archived).map((entry) => entry.name)
    return exercise.name && !active.includes(exercise.name) ? [exercise.name, ...active] : active
  }, [library, exercise.name])
  const term = query.trim()
  const exact = !!term && library.some((entry) => entry.nameKey === exerciseNameKey(term))
  return <Combobox items={names} value={exercise.name || null} disabled={disabled}
    onInputValueChange={(value) => setQuery(value)}
    onValueChange={(name) => { const entry = name && library.find((item) => item.name === name); if (entry) onPick(entry) }}>
    <ComboboxInput aria-label="Exercise name" placeholder="Search library..." className="w-full min-w-0" />
    <ComboboxContent>
      <ComboboxEmpty>No matching exercises.</ComboboxEmpty>
      <ComboboxList>{(item: string) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList>
      {!exact && <div className="border-t p-1">
        <Button type="button" variant="ghost" size="sm" className="w-full justify-start font-normal" onMouseDown={(event) => event.preventDefault()} onClick={() => onAddNew(term && term !== exercise.name ? term : "")}>
          <PlusIcon data-icon="inline-start" />{term && term !== exercise.name ? <span className="truncate">Add "{term}" as new exercise</span> : "Add new exercise"}
        </Button>
      </div>}
    </ComboboxContent>
  </Combobox>
}

function placementFromLibrary(entry: LibraryExercise, current: ProgramExercise): Partial<ProgramExercise> {
  const relinked = entry.id !== current.exerciseId
  return {
    exerciseId: entry.id, name: entry.name, muscleGroup: entry.muscleGroup || current.muscleGroup,
    videoUrl: entry.videoUrl,
    // A thumbnail belongs to the old video; drop it when the exercise changes.
    ...(relinked ? { videoThumbUrl: null } : {}),
    // The library type is only a default: this placement may override it afterwards.
    exerciseType: entry.defaultType, targetValue: "", targetSecondary: "", targetReps: "",
  }
}

function newExercise(section: ExerciseSection): ProgramExercise {
  return { id: crypto.randomUUID(), exerciseId: null, videoUrl: null, videoThumbUrl: null, name: "", muscleGroup: section === "lifts" ? "Full Body" : section, section, exerciseType: section === "cardio" ? "distance-duration" : "weight-reps", targetSets: section === "cardio" ? 1 : 3, targetReps: "", targetSecondary: "", targetValue: "", restSeconds: 60, cues: [], sets: [] }
}

export function ProgramWeekEditor({ program, weeks, legacyDays, onDirtyChange }: { program: ProgramRecord; weeks: ProgramWeek[]; legacyDays: ProgramWorkoutDay[]; onDirtyChange: (dirty: boolean) => void }) {
  const { user } = useAdminAuth()
  const [week, setWeek] = useState(1)
  const [drafts, setDrafts] = useState<Record<number, ProgramWorkoutDay[]>>({})
  const [baseRevision, setBaseRevision] = useState(program.scheduleRevision)
  const [copyOpen, setCopyOpen] = useState(false)
  const [destinations, setDestinations] = useState<number[]>([])
  const [confirmCopy, setConfirmCopy] = useState(false)
  const [confirmLive, setConfirmLive] = useState(false)
  const [settingsDayId, setSettingsDayId] = useState<string | null>(null)
  const [removeDayId, setRemoveDayId] = useState<string | null>(null)
  const currentWeek = Math.min(week, program.totalWeeks)
  const days = drafts[currentWeek] ?? resolveWeek(weeks, legacyDays, currentWeek)
  const dirty = Object.keys(drafts).length > 0
  const live = program.status === "published"
  const editable = program.status === "draft" || live
  // Tabs compare unsaved drafts too, so "Same as" clears as soon as a week diverges.
  const effectiveWeeks = useMemo(() => [
    ...weeks.filter((item) => !drafts[item.weekNumber]),
    ...Object.entries(drafts).map(([key, value]) => ({ weekNumber: Number(key), days: value })),
  ], [weeks, drafts])
  const settingsDay = days.find((day) => day.id === settingsDayId)
  const libraryQuery = useExerciseLibraryQuery()
  const library = libraryQuery.data ?? []
  const [addingExercise, setAddingExercise] = useState<{ dayId: string; placementId: string; name: string; section: ExerciseSection } | null>(null)

  const save = useMutation({
    mutationFn: (changes: ProgramWeek[]) => {
      if (!user) throw new Error("Your admin session has expired.")
      return saveProgramWeeks({ program: { ...program, scheduleRevision: dirty ? baseRevision : program.scheduleRevision }, weeks, legacyDays, changes, user })
    },
    onSuccess: () => { setDrafts({}); onDirtyChange(false); setCopyOpen(false); setDestinations([]); setConfirmCopy(false); setConfirmLive(false); toast.success("Weekly schedule saved") },
    onError: (error) => toast.error(error.message),
  })

  function updateDays(next: ProgramWorkoutDay[]) {
    if (!dirty) setBaseRevision(program.scheduleRevision)
    setDrafts((current) => ({ ...current, [currentWeek]: next }))
    onDirtyChange(true)
  }
  function updateDay(id: string, patch: Partial<ProgramWorkoutDay>) { updateDays(days.map((day) => day.id === id ? { ...day, ...patch } : day)) }
  function updateExercise(day: ProgramWorkoutDay, id: string, patch: Partial<ProgramExercise>) {
    updateDay(day.id, { exercises: day.exercises.map((exercise) => exercise.id === id ? { ...exercise, ...patch } : exercise) })
  }
  const imageUpload = useMutation({
    mutationFn: async ({ day, file }: { day: ProgramWorkoutDay; file: File }) => ({ day, image: await uploadProgramHero(program.id, day.id, file) }),
    onSuccess: ({ day, image }) => { updateDay(day.id, { heroImage: image }); toast.success("Image uploaded. Save the week to apply it.") },
    onError: (error) => toast.error(error.message),
  })
  const disabled = !editable || save.isPending || imageUpload.isPending

  const weekNumbers = Array.from({ length: program.totalWeeks }, (_, index) => index + 1)
  const replacing = destinations.filter((number) => resolveWeek(effectiveWeeks, legacyDays, number).length > 0)
  const saveDrafts = () => save.mutate(Object.entries(drafts).map(([key, value]) => ({ weekNumber: Number(key), days: value })))
  // A live copy may only land on weeks with the same days, or it would change the structure.
  const copyTargets = weekNumbers.filter((number) => number !== currentWeek)
    .map((number) => ({ number, compatible: !live || sameDayStructure(days, resolveWeek(effectiveWeeks, legacyDays, number)) }))
  function copyWeek() {
    save.mutate(destinations.map((number) => ({ weekNumber: number, days: structuredClone(days) })))
  }

  return <section className="grid min-w-0 gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold">Training Days</h2>
        <p className="text-sm text-muted-foreground">{live ? "This program is live. Exercises, targets, and day settings can change; days can't be added or removed." : "Each week can run its own plan. Build one, then copy it to the weeks that should match — copies stay independent."}</p>
      </div>
      {dirty && <div className="flex items-center gap-2"><Badge variant="outline">Unsaved changes</Badge><Button variant="outline" size="sm" disabled={disabled} onClick={() => { setDrafts({}); onDirtyChange(false) }}>Discard</Button><Button size="sm" disabled={disabled} onClick={() => live ? setConfirmLive(true) : saveDrafts()}>{save.isPending && <Spinner />}Save changes</Button></div>}
    </div>

    <div role="tablist" aria-label="Program weeks" className="flex gap-2 overflow-x-auto pb-1">
      {weekNumbers.map((number) => {
        const sameAs = matchingWeek(effectiveWeeks, legacyDays, number)
        const count = resolveWeek(effectiveWeeks, legacyDays, number).reduce((sum, day) => sum + activeExercises(day).length, 0)
        const active = number === currentWeek
        return <button key={number} type="button" role="tab" aria-selected={active} onClick={() => { setWeek(number); setSettingsDayId(null) }}
          className={cn("flex min-w-24 flex-none flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            active ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted")}>
          <span className="text-sm font-semibold">W{number}{drafts[number] && <span className="ml-1 text-amber-500" aria-label="unsaved">•</span>}</span>
          <span className={cn("text-[11px] whitespace-nowrap", active ? "text-background/70" : "text-muted-foreground")}>{sameAs ? `Same as W${sameAs}` : `${count} exercises`}</span>
        </button>
      })}
    </div>

    {editable && <div className="flex flex-wrap justify-end gap-2">
      {!live && <Button variant="outline" size="sm" disabled={disabled || days.length >= 14} onClick={() => {
        const dayNumber = Array.from({ length: 14 }, (_, index) => index + 1).find((number) => !days.some((day) => day.dayNumber === number))!
        updateDays([...days, { id: `day-${dayNumber}`, dayNumber, label: workoutNames[(dayNumber - 1) % workoutNames.length]!, focus: "", estimatedMinutes: 45, estimatedKcal: 150, proofRequired: true, optional: false, heroImage: null, coreEnabled: false, cardioEnabled: false, exercises: [newExercise("lifts")] }])
      }}><PlusIcon data-icon="inline-start" />Add day</Button>}
      <Popover open={copyOpen} onOpenChange={(open) => { if (save.isPending) return; setCopyOpen(open); if (open) setDestinations([]) }}>
        <PopoverTrigger render={<Button variant="outline" size="sm" disabled={disabled || dirty || !days.length || program.totalWeeks < 2} title={dirty ? "Save or discard changes before copying" : undefined} />}><CopyIcon data-icon="inline-start" />Copy this week to...</PopoverTrigger>
        <PopoverContent align="end" className="w-56 gap-3">
          <p className="text-sm font-medium">Copy Week {currentWeek} to:</p>
          <div className="grid max-h-64 gap-2 overflow-y-auto">
            {copyTargets.map(({ number, compatible }) => <Field key={number} orientation="horizontal" data-disabled={!compatible || undefined}><Checkbox id={`copy-${number}`} disabled={!compatible} checked={destinations.includes(number)} onCheckedChange={(checked) => setDestinations((current) => checked ? [...current, number] : current.filter((value) => value !== number))} /><FieldLabel htmlFor={`copy-${number}`} className="font-normal">Week {number}{!compatible && <span className="text-xs text-muted-foreground">different days</span>}</FieldLabel></Field>)}
          </div>
          <Button size="sm" disabled={!destinations.length || save.isPending} onClick={() => replacing.length ? setConfirmCopy(true) : copyWeek()}>{save.isPending && <Spinner />}Apply</Button>
        </PopoverContent>
      </Popover>
    </div>}

    {!days.length && <p className="py-12 text-center text-sm text-muted-foreground">No training days in Week {currentWeek}.</p>}
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {days.map((day) => <Card key={day.id} size="sm" className="min-w-0 rounded-lg">
        <CardHeader>
          <CardTitle className="min-w-0 truncate">Day {day.dayNumber} — {day.label}</CardTitle>
          {editable && <CardAction className="flex gap-0.5"><Button size="icon-sm" variant="ghost" title="Workout settings" aria-label={`Settings for ${day.label}`} disabled={disabled} onClick={() => setSettingsDayId(day.id)}><Settings2Icon /></Button>{!live && <Button size="icon-sm" variant="ghost" title="Remove day" aria-label={`Remove ${day.label}`} disabled={disabled} onClick={() => setRemoveDayId(day.id)}><Trash2Icon /></Button>}</CardAction>}
        </CardHeader>
        <CardContent className="grid gap-4">
          {(["lifts", "core", "cardio"] as const).map((section, sectionIndex) => {
            const enabled = section === "lifts" || (section === "core" ? day.coreEnabled !== false : day.cardioEnabled !== false)
            const exercises = day.exercises.filter((exercise) => sectionOf(exercise) === section)
            return <section key={section} className="grid gap-2">
              {sectionIndex > 0 && <Separator className="mb-2" />}
              <div className="flex min-h-5 items-center justify-between"><h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{section}</h3>{section !== "lifts" && <Switch size="sm" aria-label={`Enable ${section} for ${day.label}`} checked={enabled} disabled={disabled} onCheckedChange={(checked) => updateDay(day.id, section === "core" ? { coreEnabled: checked } : { cardioEnabled: checked })} />}</div>
              {!enabled ? <p className="text-xs text-muted-foreground">{section === "core" ? "Core" : "Cardio"} is off for this day{exercises.length ? ` — ${exercises.length} exercise${exercises.length === 1 ? "" : "s"} kept` : ""}.</p> : <>
                {exercises.length > 0 && <div className={cn(exerciseGrid, "text-[11px] font-medium tracking-wide text-muted-foreground uppercase")}><span>Exercise</span><span>Type</span><span>Sets</span><span>Target</span></div>}
                {exercises.map((exercise) => <div key={exercise.id} className={exerciseGrid}>
                  <ExercisePicker exercise={exercise} library={library} disabled={disabled} onPick={(entry) => updateExercise(day, exercise.id, placementFromLibrary(entry, exercise))} onAddNew={(name) => setAddingExercise({ dayId: day.id, placementId: exercise.id, name, section })} />
                  <Select items={exerciseTypes} value={exerciseTypeFields(exercise.exerciseType).value} disabled={disabled} onValueChange={(value) => value && updateExercise(day, exercise.id, { exerciseType: exerciseTypeOf(value), targetValue: "", targetSecondary: "", targetReps: "" })}><SelectTrigger className="w-full min-w-0" aria-label={`Type for ${exercise.name || "exercise"}`}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{exerciseTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
                  <Input aria-label={`Sets for ${exercise.name || "exercise"}`} type="number" min={1} max={20} className="px-2 text-center" value={exercise.targetSets || ""} disabled={disabled} onChange={(event) => updateExercise(day, exercise.id, { targetSets: Number(event.target.value) })} />
                  <TargetInputs exercise={exercise} disabled={disabled} onChange={(patch) => updateExercise(day, exercise.id, patch)} />
                  <Button size="icon-sm" variant="ghost" className="text-muted-foreground" disabled={disabled} title="Remove exercise" aria-label={`Remove ${exercise.name || "exercise"}`} onClick={() => updateDay(day.id, { exercises: day.exercises.filter((item) => item.id !== exercise.id) })}><Trash2Icon /></Button>
                </div>)}
                {editable && <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" disabled={disabled || day.exercises.length >= 20} onClick={() => updateDay(day.id, { exercises: [...day.exercises, newExercise(section)] })}><PlusIcon data-icon="inline-start" />Add exercise</Button>}
              </>}
            </section>
          })}
        </CardContent>
      </Card>)}
    </div>

    <NewExerciseDialog compact open={!!addingExercise} initialName={addingExercise?.name} initialType={addingExercise?.section === "cardio" ? "distance-duration" : addingExercise?.section === "core" ? "bodyweight-reps" : "weight-reps"}
      onOpenChange={(open) => !open && setAddingExercise(null)}
      onCreated={(entry) => {
        const day = days.find((item) => item.id === addingExercise?.dayId)
        const placement = day?.exercises.find((item) => item.id === addingExercise?.placementId)
        if (day && placement) updateExercise(day, placement.id, placementFromLibrary(entry, placement))
      }} />

    <Dialog open={confirmLive} onOpenChange={(open) => !save.isPending && setConfirmLive(open)}><DialogContent>
      <DialogHeader><DialogTitle>Update the live program?</DialogTitle><DialogDescription>Members enrolled in {program.name} v{program.version} will see these changes as soon as you save. Workouts they've already logged stay unchanged.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={save.isPending} onClick={() => setConfirmLive(false)}>Cancel</Button><Button disabled={save.isPending} onClick={saveDrafts}>{save.isPending && <Spinner />}Save to live program</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={confirmCopy} onOpenChange={(open) => !save.isPending && setConfirmCopy(open)}><DialogContent>
      <DialogHeader><DialogTitle>Replace existing weeks?</DialogTitle><DialogDescription>The training plan in {replacing.map((number) => `Week ${number}`).join(", ")} will be replaced with a copy of Week {currentWeek}. Other weeks stay unchanged.{live && " Enrolled members see the change immediately."}</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={save.isPending} onClick={() => setConfirmCopy(false)}>Cancel</Button><Button disabled={save.isPending} onClick={copyWeek}>{save.isPending && <Spinner />}Replace weeks</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={!!removeDayId} onOpenChange={(open) => !open && setRemoveDayId(null)}><DialogContent><DialogHeader><DialogTitle>Remove workout day?</DialogTitle><DialogDescription>This removes the day from Week {currentWeek} when you save changes.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRemoveDayId(null)}>Cancel</Button><Button variant="destructive" onClick={() => { updateDays(days.filter((day) => day.id !== removeDayId)); setRemoveDayId(null) }}>Remove day</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!settingsDay} onOpenChange={(open) => !open && !imageUpload.isPending && setSettingsDayId(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Workout settings</DialogTitle></DialogHeader>
      {settingsDay && <FieldGroup>
        <Field><FieldLabel>Workout name</FieldLabel><NamePicker label="Workout name" value={settingsDay.label} options={[...new Set([...workoutNames, settingsDay.label])]} disabled={disabled} onChange={(label) => updateDay(settingsDay.id, { label })} /></Field>
        <Field><FieldLabel htmlFor="day-focus">Focus</FieldLabel><Input id="day-focus" value={settingsDay.focus} onChange={(event) => updateDay(settingsDay.id, { focus: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor="day-minutes">Estimated minutes</FieldLabel><Input id="day-minutes" type="number" min={1} max={300} value={settingsDay.estimatedMinutes} onChange={(event) => updateDay(settingsDay.id, { estimatedMinutes: Number(event.target.value) })} /></Field>
        <Field orientation="horizontal"><Switch id="day-proof" checked={settingsDay.proofRequired} onCheckedChange={(proofRequired) => updateDay(settingsDay.id, { proofRequired })} /><FieldLabel htmlFor="day-proof">Proof required</FieldLabel></Field>
        <Field orientation="horizontal"><Switch id="day-optional" checked={settingsDay.optional} onCheckedChange={(optional) => updateDay(settingsDay.id, { optional })} /><FieldLabel htmlFor="day-optional">Optional workout</FieldLabel></Field>
        <Field><FieldLabel htmlFor="day-image"><ImageIcon /> Workout image</FieldLabel>{settingsDay.heroImage && <img src={settingsDay.heroImage.downloadUrl} alt={settingsDay.label} className="max-h-40 w-full rounded-md object-contain" />}<Input id="day-image" type="file" accept="image/*" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) imageUpload.mutate({ day: settingsDay, file }); event.target.value = "" }} />{settingsDay.heroImage && <Button variant="outline" disabled={disabled} onClick={() => updateDay(settingsDay.id, { heroImage: null })}>Remove image</Button>}</Field>
      </FieldGroup>}
      <DialogFooter><Button disabled={imageUpload.isPending} onClick={() => setSettingsDayId(null)}>Done</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>
}
