import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { reviewMemberCheckIn, type MemberCheckInSummary } from "@/lib/members"

type ReviewableCheckIn = Pick<MemberCheckInSummary, "id" | "reviewStatus" | "reviewNote" | "reviewedAt" | "reviewedByEmail">

/** The coach's review of one weekly check-in. Used on a member's page and on Feedback. */
export function CheckInReviewForm({ memberId, checkIn, onSaved }: { memberId: string; checkIn: ReviewableCheckIn; onSaved?: () => void }) {
  const { user } = useAdminAuth()
  const [status, setStatus] = useState(checkIn.reviewStatus)
  const [note, setNote] = useState(checkIn.reviewNote)
  const mutation = useMutation({
    mutationFn: reviewMemberCheckIn,
    onSuccess: () => { toast.success("Check-in review saved"); onSaved?.() },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Check-in review failed."),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return toast.error("Your admin session has expired.")
    mutation.mutate({ memberId, checkInId: checkIn.id, status, note, user })
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <p className="text-xs font-semibold uppercase">Coach review</p>
      <div className="grid gap-2 md:grid-cols-[12rem_1fr_auto]">
        <Select value={status} onValueChange={(value) => value && setStatus(value)}>
          <SelectTrigger className="w-full" aria-label="Check-in review status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="needs-attention">Needs attention</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
        <Input value={note} maxLength={500} placeholder="Optional check-in review note" onChange={(event) => setNote(event.target.value)} />
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner data-icon="inline-start" />} Save review
        </Button>
      </div>
      {checkIn.reviewedByEmail && (
        <p className="text-xs text-muted-foreground">
          Last reviewed by {checkIn.reviewedByEmail}{checkIn.reviewedAt && checkIn.reviewedAt.getTime() > 0 ? ` on ${checkIn.reviewedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}.
        </p>
      )}
    </form>
  )
}
