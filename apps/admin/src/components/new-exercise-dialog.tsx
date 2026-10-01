import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { exerciseTypeOf, exerciseTypes, type ExerciseType } from "@/lib/exercise-types"
import { createLibraryExercise, type LibraryExercise } from "@/lib/exercise-library"

export function ExerciseTypeSelect({ id, value, disabled, onChange, className }: { id?: string; value: ExerciseType; disabled?: boolean; onChange: (value: ExerciseType) => void; className?: string }) {
  return <Select items={exerciseTypes} value={value} disabled={disabled} onValueChange={(next) => next && onChange(exerciseTypeOf(next))}>
    <SelectTrigger id={id} className={className ?? "w-full"}><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{exerciseTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>
}

function NewExerciseForm({ initialName, initialType, compact, onCreated, onCancel }: { initialName: string; initialType: ExerciseType; compact: boolean; onCreated: (exercise: LibraryExercise) => void; onCancel: () => void }) {
  const { user } = useAdminAuth()
  const [name, setName] = useState(initialName)
  const [defaultType, setDefaultType] = useState<ExerciseType>(initialType)
  const [muscleGroup, setMuscleGroup] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const mutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Your admin session has expired.")
      return createLibraryExercise({ name, defaultType, muscleGroup, videoUrl }, user)
    },
    onSuccess: (exercise) => { toast.success(`${exercise.name} added to the library`); onCreated(exercise) },
    onError: (error) => toast.error(error.message),
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    // The dialog can open from inside another form (a training day); keep this submit local.
    event.stopPropagation()
    mutation.mutate()
  }
  const busy = mutation.isPending
  return <form onSubmit={submit} className="contents">
    <FieldGroup className="gap-4">
      <Field className="gap-1.5"><FieldLabel htmlFor="new-exercise-name">Exercise name</FieldLabel><Input id="new-exercise-name" autoFocus value={name} maxLength={80} required disabled={busy} placeholder="Back Squat" onChange={(event) => setName(event.target.value)} /></Field>
      <Field className="gap-1.5"><FieldLabel htmlFor="new-exercise-type">Default type</FieldLabel><ExerciseTypeSelect id="new-exercise-type" value={defaultType} disabled={busy} onChange={setDefaultType} /></Field>
      {!compact && <>
        <Field className="gap-1.5"><FieldLabel htmlFor="new-exercise-muscle">Muscle group <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="new-exercise-muscle" value={muscleGroup} maxLength={40} disabled={busy} placeholder="Quads" onChange={(event) => setMuscleGroup(event.target.value)} /></Field>
        <Field className="gap-1.5"><FieldLabel htmlFor="new-exercise-video">Video link <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="new-exercise-video" type="url" value={videoUrl} disabled={busy} placeholder="https://…/clip.mp4" onChange={(event) => setVideoUrl(event.target.value)} /><FieldDescription>A direct video file link (MP4). YouTube, Vimeo and Drive pages won't play in the app.</FieldDescription></Field>
      </>}
    </FieldGroup>
    <DialogFooter>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={busy || name.trim().length < 2}>{busy && <Spinner />}Add exercise</Button>
    </DialogFooter>
  </form>
}

/**
 * Creates a library entry. `compact` (used inline from Training Days) asks only for
 * name and type, so building a day never stalls on finding a video.
 */
export function NewExerciseDialog({ open, initialName = "", initialType = "weight-reps", compact = false, onOpenChange, onCreated }: {
  open: boolean
  initialName?: string
  initialType?: ExerciseType
  compact?: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (exercise: LibraryExercise) => void
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add exercise to library</DialogTitle>
        <DialogDescription>{compact ? "Available in every program. Add a video link later from the Exercise library." : "Available to every program's training days."}</DialogDescription>
      </DialogHeader>
      {open && <NewExerciseForm key={initialName} initialName={initialName} initialType={initialType} compact={compact} onCancel={() => onOpenChange(false)} onCreated={(exercise) => { onOpenChange(false); onCreated?.(exercise) }} />}
    </DialogContent>
  </Dialog>
}
