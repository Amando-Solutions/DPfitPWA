import { type FormEvent, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { User } from "firebase/auth"
import {
  BookOpenIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useProgramGuidesQuery } from "@/hooks/use-admin-queries"
import { cn } from "@/lib/utils"
import {
  deleteProgramGuide,
  saveProgramGuide,
  saveProgramRewards,
  saveProgramWeekThemes,
  type ProgramGuide,
  type ProgramGuideInput,
  type ProgramRecord,
  type ProgramRewardConfig,
  type ProgramWeekTheme,
} from "@/lib/programs"

type AuthoringProps = {
  program: ProgramRecord
  user: User | null
}

const rewardValueFields = [
  ["workout", "Workout"],
  ["checkIn", "Check-in"],
  ["progressPhoto", "Photo"],
  ["core", "Core"],
  ["cardio", "Cardio"],
] as const

const tierFields = [
  ["starter", "Starter"],
  ["consistency", "Consistency"],
  ["elite", "Elite"],
] as const

const targetFields = [
  ["dayRepeats", "Day repeats"],
  ["checkInWeeks", "Check-in weeks"],
  ["foundationWeek", "Foundation week"],
  ["foundationSessions", "Foundation sessions"],
  ["peakWeek", "Peak week"],
  ["peakSessions", "Peak sessions"],
] as const

const badgeRuleItems = [
  { label: "First workout", value: "first-workout" },
  { label: "First photo", value: "first-photo" },
  { label: "Consistency queen", value: "consistency-queen" },
  { label: "Four-week check-in streak", value: "checkin-streak-4" },
  { label: "Foundation complete", value: "foundation-complete" },
  { label: "Peak performer", value: "peak-performer" },
  { label: "No days off", value: "no-days-off" },
]

const tierItems = [
  { label: "Starter", value: "starter" },
  { label: "Consistency", value: "consistency" },
  { label: "Elite", value: "elite" },
]

function cloneRewards(rewards: ProgramRewardConfig): ProgramRewardConfig {
  return {
    values: { ...rewards.values },
    badgeTierPoints: { ...rewards.badgeTierPoints },
    badgeTargets: { ...rewards.badgeTargets },
    ranks: rewards.ranks.map((rank) => ({ ...rank })),
    badges: rewards.badges.map((badge) => ({ ...badge })),
  }
}

export function WeekThemesPanel({ program, user }: AuthoringProps) {
  const [open, setOpen] = useState(false)
  const [themes, setThemes] = useState<ProgramWeekTheme[]>(program.weekThemes)
  const saveMutation = useMutation({
    mutationFn: (nextThemes: ProgramWeekTheme[]) => {
      if (!user) throw new Error("Your admin session has expired. Sign in again.")
      return saveProgramWeekThemes(program, nextThemes, user)
    },
    onSuccess: () => {
      setOpen(false)
      toast.success("Week themes saved")
    },
    onError: (error) => toast.error(error.message || "Week themes could not be saved."),
  })
  const isSaving = saveMutation.isPending

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return toast.error("Your admin session has expired. Sign in again.")
    saveMutation.mutate(themes)
  }

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Week themes</CardTitle>
          <CardDescription>The primary focus and progression assigned to each week.</CardDescription>
          {program.status === "draft" && (
            <CardAction className="flex items-center gap-2">
              <Badge variant={program.weekThemesConfigured ? "secondary" : "outline"}>
                {program.weekThemesConfigured ? "Ready" : "Needs review"}
              </Badge>
              <Button type="button" size="sm" variant="outline" onClick={() => { setThemes(program.weekThemes); setOpen(true) }}>
                <PencilIcon data-icon="inline-start" /> Edit themes
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {program.weekThemes.map((theme) => (
            <div key={theme.weekNumber} className="rounded-lg border p-4">
              <p className="font-mono text-xs text-muted-foreground">WEEK {theme.weekNumber}</p>
              <p className="mt-2 font-medium">{theme.title}</p>
              {theme.subtitle && <p className="mt-1 text-sm text-muted-foreground">{theme.subtitle}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => !isSaving && setOpen(next)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={handleSave} className="contents">
            <DialogHeader><DialogTitle>Edit week themes</DialogTitle></DialogHeader>
            <FieldGroup>
              {themes.map((theme, index) => (
                <Card key={theme.weekNumber} size="sm">
                  <CardHeader><CardTitle>Week {theme.weekNumber}</CardTitle></CardHeader>
                  <CardContent>
                    <FieldGroup>
                      <Field data-disabled={isSaving || undefined}>
                        <FieldLabel htmlFor={`week-${theme.weekNumber}-title`}>Theme</FieldLabel>
                        <Input
                          id={`week-${theme.weekNumber}-title`}
                          value={theme.title}
                          maxLength={80}
                          disabled={isSaving}
                          required
                          onChange={(event) => setThemes((current) => current.map((item, itemIndex) => (
                            itemIndex === index ? { ...item, title: event.target.value } : item
                          )))}
                        />
                      </Field>
                      <Field data-disabled={isSaving || undefined}>
                        <FieldLabel htmlFor={`week-${theme.weekNumber}-subtitle`}>Description</FieldLabel>
                        <Input
                          id={`week-${theme.weekNumber}-subtitle`}
                          value={theme.subtitle}
                          maxLength={160}
                          disabled={isSaving}
                          onChange={(event) => setThemes((current) => current.map((item, itemIndex) => (
                            itemIndex === index ? { ...item, subtitle: event.target.value } : item
                          )))}
                        />
                      </Field>
                    </FieldGroup>
                  </CardContent>
                </Card>
              ))}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving && <Spinner data-icon="inline-start" />} Save themes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

const compactLabel = "text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
const rankGrid = "grid grid-cols-[3.5rem_minmax(0,1fr)_6rem_1.75rem] items-center gap-2"

function CompactNumber({ id, label, value, max, suffix, disabled, onChange }: { id: string; label: string; value: number; max: number; suffix?: string; disabled: boolean; onChange: (value: number) => void }) {
  return <Field data-disabled={disabled || undefined} className="min-w-0 gap-1">
    <FieldLabel htmlFor={id} title={label} className={cn(compactLabel, "block truncate")}>{label}</FieldLabel>
    <InputGroup>
      <InputGroupInput id={id} type="number" min="0" max={max} value={value} disabled={disabled} className="tabular-nums" onChange={(event) => onChange(Number(event.target.value))} />
      {suffix && <InputGroupAddon align="inline-end" className="text-xs">{suffix}</InputGroupAddon>}
    </InputGroup>
  </Field>
}

const tierBadgeVariant = { starter: "outline", consistency: "secondary", elite: "default" } as const

export function RewardsPanel({ program, user }: AuthoringProps) {
  const [rewards, setRewards] = useState(() => cloneRewards(program.rewards))
  const saveMutation = useMutation({
    mutationFn: (nextRewards: ProgramRewardConfig) => {
      if (!user) throw new Error("Your admin session has expired. Sign in again.")
      return saveProgramRewards(program, nextRewards, user)
    },
    onSuccess: () => toast.success("Reward economy saved"),
    onError: (error) => toast.error(error.message || "Rewards could not be saved."),
  })
  const isSaving = saveMutation.isPending

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return toast.error("Your admin session has expired. Sign in again.")
    saveMutation.mutate(rewards)
  }

  const draft = program.status === "draft"
  const disabled = isSaving || !draft
  type Rank = ProgramRewardConfig["ranks"][number]
  type BadgeRule = ProgramRewardConfig["badges"][number]
  const setRank = (index: number, patch: Partial<Rank>) => setRewards((current) => ({ ...current, ranks: current.ranks.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }))
  const [editingBadge, setEditingBadge] = useState<number | null>(null)
  const badgeBeingEdited = editingBadge === null ? null : rewards.badges[editingBadge]
  const setBadge = (index: number, patch: Partial<BadgeRule>) => setRewards((current) => ({ ...current, badges: current.badges.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }))

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      {/* Two independent columns, paired so their heights balance: no row gaps under a short card. */}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <Card size="sm" className="rounded-lg">
            <CardHeader>
              <CardTitle>Reward points</CardTitle>
              <CardAction><Badge variant={program.rewardsConfigured ? "secondary" : "outline"}>{program.rewardsConfigured ? "Configured" : "Needs review"}</Badge></CardAction>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {rewardValueFields.map(([key, label]) => (
                <CompactNumber key={key} id={`reward-${key}`} label={label} value={rewards.values[key]} max={100000} suffix="pts" disabled={disabled} onChange={(value) => setRewards((current) => ({ ...current, values: { ...current.values, [key]: value } }))} />
              ))}
            </CardContent>
          </Card>

          <Card size="sm" className="rounded-lg">
            <CardHeader>
              <CardTitle>Badge definitions</CardTitle>
              <CardDescription className="text-xs">Rules the PWA evaluates against member activity.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1">
              {rewards.badges.length === 0 && <p className="text-xs text-muted-foreground">No badges configured.</p>}
              <ul className="-mx-2 grid">
                {rewards.badges.map((badge, index) => (
                  <li key={`${badge.id}-${index}`} className="group/badge flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-lg" aria-hidden>{badge.emoji || "·"}</span>
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{badge.name || "Untitled badge"}</span>
                        <Badge variant={tierBadgeVariant[badge.tier]} className="h-4 px-1.5 text-[10px] capitalize">{badge.tier}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="text-foreground/70">{badgeRuleItems.find((item) => item.value === badge.id)?.label ?? badge.id}</span>
                        {badge.description && <> · {badge.description}</>}
                      </p>
                    </div>
                    {draft && <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover/badge:opacity-100 group-focus-within/badge:opacity-100">
                      <Button type="button" size="icon-sm" variant="ghost" title="Edit badge" aria-label={`Edit ${badge.name || `badge ${index + 1}`}`} disabled={isSaving} onClick={() => setEditingBadge(index)}><PencilIcon /></Button>
                      <Button type="button" size="icon-sm" variant="ghost" title="Remove badge" aria-label={`Remove ${badge.name || `badge ${index + 1}`}`} disabled={isSaving} onClick={() => setRewards((current) => ({ ...current, badges: current.badges.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2Icon /></Button>
                    </div>}
                  </li>
                ))}
              </ul>
              {draft && <Button type="button" size="sm" variant="ghost" className="w-fit text-muted-foreground" disabled={isSaving || rewards.badges.length >= badgeRuleItems.length} onClick={() => {
                setEditingBadge(rewards.badges.length)
                setRewards((current) => ({ ...current, badges: [...current.badges, { id: badgeRuleItems.find((item) => !current.badges.some((badge) => badge.id === item.value))?.value ?? "first-workout", name: "", emoji: "", description: "", tier: "starter" }] }))
              }}><PlusIcon data-icon="inline-start" />Add badge</Button>}
            </CardContent>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card size="sm" className="rounded-lg">
            <CardHeader><CardTitle>Badge awards</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <p className={compactLabel}>Badge tier points</p>
              <div className="-mt-1 grid grid-cols-3 gap-3">
                {tierFields.map(([key, label]) => (
                  <CompactNumber key={key} id={`tier-${key}`} label={label} value={rewards.badgeTierPoints[key]} max={100000} suffix="pts" disabled={disabled} onChange={(value) => setRewards((current) => ({ ...current, badgeTierPoints: { ...current.badgeTierPoints, [key]: value } }))} />
                ))}
              </div>
              <Separator />
              <p className={compactLabel}>Badge targets</p>
              <div className="-mt-1 grid grid-cols-3 gap-3">
                {targetFields.map(([key, label]) => (
                  <CompactNumber key={key} id={`target-${key}`} label={label} value={rewards.badgeTargets[key]} max={1000} disabled={disabled} onChange={(value) => setRewards((current) => ({ ...current, badgeTargets: { ...current.badgeTargets, [key]: value } }))} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card size="sm" className="rounded-lg">
            <CardHeader>
              <CardTitle>Rank ladder</CardTitle>
              <CardDescription className="text-xs">Shown in ascending point order.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {rewards.ranks.length === 0 ? <p className="text-xs text-muted-foreground">No ranks configured.</p>
                : <div className={cn(rankGrid, compactLabel)}><span>Emoji</span><span>Name</span><span>Min points</span></div>}
              {rewards.ranks.map((rank, index) => (
                <div key={rank.id} className={rankGrid}>
                  <Input aria-label={`Rank ${index + 1} emoji`} className="px-2 text-center" value={rank.emoji} maxLength={8} disabled={disabled} onChange={(event) => setRank(index, { emoji: event.target.value })} />
                  <Input aria-label={`Rank ${index + 1} name`} value={rank.name} maxLength={60} disabled={disabled} onChange={(event) => setRank(index, { name: event.target.value })} />
                  <Input aria-label={`Rank ${index + 1} minimum points`} type="number" min="0" max="100000" value={rank.minPoints} disabled={disabled} onChange={(event) => setRank(index, { minPoints: Number(event.target.value) })} />
                  {draft && <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground" title="Remove rank" aria-label={`Remove ${rank.name || `rank ${index + 1}`}`} disabled={isSaving} onClick={() => setRewards((current) => ({ ...current, ranks: current.ranks.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2Icon /></Button>}
                </div>
              ))}
              {draft && <Button type="button" size="sm" variant="ghost" className="w-fit text-muted-foreground" disabled={isSaving} onClick={() => setRewards((current) => ({ ...current, ranks: [...current.ranks, { id: crypto.randomUUID(), name: "", emoji: "", minPoints: 0 }] }))}><PlusIcon data-icon="inline-start" />Add rank</Button>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={badgeBeingEdited != null} onOpenChange={(open) => !open && setEditingBadge(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit badge</DialogTitle></DialogHeader>
          {badgeBeingEdited && editingBadge !== null && <FieldGroup className="gap-4">
            <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3">
              <Field className="gap-1.5"><FieldLabel htmlFor="badge-emoji">Emoji</FieldLabel><Input id="badge-emoji" className="text-center text-lg" value={badgeBeingEdited.emoji} maxLength={8} onChange={(event) => setBadge(editingBadge, { emoji: event.target.value })} /></Field>
              <Field className="gap-1.5"><FieldLabel htmlFor="badge-name">Name</FieldLabel><Input id="badge-name" value={badgeBeingEdited.name} maxLength={80} placeholder="First Rep" onChange={(event) => setBadge(editingBadge, { name: event.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field className="gap-1.5"><FieldLabel htmlFor="badge-rule">Rule</FieldLabel><Select items={badgeRuleItems} value={badgeBeingEdited.id} onValueChange={(value) => value && setBadge(editingBadge, { id: value })}><SelectTrigger id="badge-rule" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{badgeRuleItems.map((item) => <SelectItem key={item.value} value={item.value} disabled={item.value !== badgeBeingEdited.id && rewards.badges.some((badge) => badge.id === item.value)}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              <Field className="gap-1.5"><FieldLabel htmlFor="badge-tier">Tier</FieldLabel><Select items={tierItems} value={badgeBeingEdited.tier} onValueChange={(value) => value && setBadge(editingBadge, { tier: value as BadgeRule["tier"] })}><SelectTrigger id="badge-tier" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{tierItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            </div>
            <Field className="gap-1.5"><FieldLabel htmlFor="badge-description">Description</FieldLabel><Textarea id="badge-description" rows={2} value={badgeBeingEdited.description} maxLength={180} placeholder="Log your first qualifying workout." onChange={(event) => setBadge(editingBadge, { description: event.target.value })} /></Field>
          </FieldGroup>}
          <DialogFooter><Button type="button" onClick={() => setEditingBadge(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {draft && <div className="flex justify-end"><Button type="submit" size="sm" disabled={isSaving}>{isSaving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}Save rewards</Button></div>}
    </form>
  )
}

const emptyGuide = (): ProgramGuideInput => ({
  title: "",
  category: "",
  readMinutes: 5,
  unlockWeek: 1,
  excerpt: "",
  body: "",
})

export function GuidesPanel({ program, user }: AuthoringProps) {
  const guidesQuery = useProgramGuidesQuery(program.id)
  const guides = guidesQuery.data ?? []
  const loadError = guidesQuery.error?.message ?? null
  const isLoading = guidesQuery.isPending
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ProgramGuideInput>(emptyGuide)
  const [deleteTarget, setDeleteTarget] = useState<ProgramGuide | null>(null)
  const saveMutation = useMutation({
    mutationFn: (input: ProgramGuideInput) => {
      if (!user) throw new Error("Your admin session has expired. Sign in again.")
      return saveProgramGuide({ ...program, guideCount: guides.length }, input, user)
    },
    onSuccess: (_, input) => {
      setOpen(false)
      toast.success(input.id ? "Guide updated" : "Guide added")
    },
    onError: (error) => toast.error(error.message || "Guide could not be saved."),
  })
  const deleteMutation = useMutation({
    mutationFn: (guide: ProgramGuide) => {
      if (!user) throw new Error("Your admin session has expired. Sign in again.")
      return deleteProgramGuide({ ...program, guideCount: guides.length }, guide.id, user)
    },
    onSuccess: () => {
      setDeleteTarget(null)
      toast.success("Guide removed")
    },
    onError: (error) => toast.error(error.message || "Guide could not be removed."),
  })
  const isSaving = saveMutation.isPending
  const isDeleting = deleteMutation.isPending

  function openNew() {
    setForm(emptyGuide())
    setOpen(true)
  }

  function openEdit(guide: ProgramGuide) {
    setForm({ ...guide })
    setOpen(true)
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return toast.error("Your admin session has expired. Sign in again.")
    saveMutation.mutate(form)
  }

  function handleDelete() {
    if (!deleteTarget || !user) return
    deleteMutation.mutate(deleteTarget)
  }

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Program guides</CardTitle>
          <CardDescription>Guides unlock for members by program week.</CardDescription>
          {program.status === "draft" && <CardAction><Button type="button" size="sm" onClick={openNew}><PlusIcon data-icon="inline-start" /> Add guide</Button></CardAction>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadError && <p className="text-sm text-destructive">{loadError}</p>}
          {isLoading && <p className="text-sm text-muted-foreground">Loading guides…</p>}
          {!isLoading && guides.length === 0 && (
            <Empty className="min-h-56"><EmptyHeader><EmptyMedia variant="icon"><BookOpenIcon /></EmptyMedia><EmptyTitle>No guides yet</EmptyTitle></EmptyHeader>{program.status === "draft" && <EmptyContent><Button type="button" variant="outline" onClick={openNew}><PlusIcon data-icon="inline-start" /> Add first guide</Button></EmptyContent>}</Empty>
          )}
          {guides.map((guide) => (
            <Card key={guide.id} size="sm">
              <CardHeader>
                <CardTitle>{guide.title}</CardTitle>
                <CardDescription>{guide.category} · {guide.readMinutes} min · Week {guide.unlockWeek}</CardDescription>
                {program.status === "draft" && <CardAction className="flex gap-1"><Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${guide.title}`} onClick={() => openEdit(guide)}><PencilIcon /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${guide.title}`} onClick={() => setDeleteTarget(guide)}><Trash2Icon /></Button></CardAction>}
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{guide.excerpt}</p></CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => !isSaving && setOpen(next)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={handleSave} className="contents">
            <DialogHeader><DialogTitle>{form.id ? "Edit guide" : "Add guide"}</DialogTitle></DialogHeader>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-disabled={isSaving || undefined}><FieldLabel htmlFor="guide-title">Title</FieldLabel><Input id="guide-title" value={form.title} maxLength={100} disabled={isSaving} required onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></Field>
                <Field data-disabled={isSaving || undefined}><FieldLabel htmlFor="guide-category">Category</FieldLabel><Input id="guide-category" value={form.category} maxLength={60} disabled={isSaving} required onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-disabled={isSaving || undefined}><FieldLabel htmlFor="guide-minutes">Read time in minutes</FieldLabel><Input id="guide-minutes" type="number" min="1" max="120" value={form.readMinutes} disabled={isSaving} required onChange={(event) => setForm((current) => ({ ...current, readMinutes: Number(event.target.value) }))} /></Field>
                <Field data-disabled={isSaving || undefined}><FieldLabel htmlFor="guide-week">Unlock week</FieldLabel><Input id="guide-week" type="number" min="1" max={program.totalWeeks} value={form.unlockWeek} disabled={isSaving} required onChange={(event) => setForm((current) => ({ ...current, unlockWeek: Number(event.target.value) }))} /></Field>
              </div>
              <Field data-disabled={isSaving || undefined}><FieldLabel htmlFor="guide-excerpt">Excerpt</FieldLabel><Textarea id="guide-excerpt" value={form.excerpt} maxLength={240} disabled={isSaving} required onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))} /><FieldDescription>Shown on the guide card before a member opens it.</FieldDescription></Field>
              <Field data-disabled={isSaving || undefined}><FieldLabel htmlFor="guide-body">Guide steps</FieldLabel><Textarea id="guide-body" className="min-h-64" value={form.body} maxLength={20000} disabled={isSaving} required onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} /><FieldDescription>Separate steps with a blank line. The PWA renders each paragraph as one numbered step.</FieldDescription></Field>
            </FieldGroup>
            <DialogFooter><Button type="button" variant="outline" disabled={isSaving} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={isSaving}>{isSaving && <Spinner data-icon="inline-start" />} Save guide</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(next) => !isDeleting && !next && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogMedia><Trash2Icon /></AlertDialogMedia><AlertDialogTitle>Remove {deleteTarget?.title}?</AlertDialogTitle><AlertDialogDescription>This removes the guide from the draft program.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={isDeleting} onClick={() => void handleDelete()}>{isDeleting && <Spinner data-icon="inline-start" />} Remove guide</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  )
}
