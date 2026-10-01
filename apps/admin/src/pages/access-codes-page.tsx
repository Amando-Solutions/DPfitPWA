import { type FormEvent, useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import {
  AlertCircleIcon,
  BanIcon,
  CheckCircle2Icon,
  ClipboardIcon,
  Clock3Icon,
  KeyRoundIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserRoundCheckIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { useAccessCodesQuery, useCohortsQuery } from "@/hooks/use-admin-queries"
import {
  effectiveCodeStatus,
  generateAccessCodes,
  revokeAccessCode,
  type AccessCodeRecord,
  type CodeStatus,
} from "@/lib/access-codes"

const accessCodeColumnHelper = createColumnHelper<DataTableFeatures, AccessCodeRecord>()

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const expiryItems = [
  { label: "7 days", value: "7" },
  { label: "14 days", value: "14" },
  { label: "30 days", value: "30" },
]

function formatDate(value: Date) {
  return value.getTime() > 0 ? dateFormatter.format(value) : "Pending"
}

function statusBadge(status: CodeStatus) {
  if (status === "claimed") {
    return (
      <Badge variant="secondary">
        <CheckCircle2Icon data-icon="inline-start" />
        Claimed
      </Badge>
    )
  }

  if (status === "expired") {
    return (
      <Badge variant="outline">
        <Clock3Icon data-icon="inline-start" />
        Expired
      </Badge>
    )
  }

  if (status === "revoked") {
    return (
      <Badge variant="destructive">
        <BanIcon data-icon="inline-start" />
        Revoked
      </Badge>
    )
  }

  return (
    <Badge>
      <ShieldCheckIcon data-icon="inline-start" />
      Unused
    </Badge>
  )
}

export function AccessCodesPage() {
  const { user } = useAdminAuth()
  const codesQuery = useAccessCodesQuery()
  const cohortsQuery = useCohortsQuery()
  const codes = useMemo(() => codesQuery.data ?? [], [codesQuery.data])
  const cohorts = useMemo(() => cohortsQuery.data ?? [], [cohortsQuery.data])
  const isLoading = codesQuery.isPending
  const [dialogOpen, setDialogOpen] = useState(false)
  const [quantity, setQuantity] = useState("1")
  const [cohort, setCohort] = useState("")
  const [expiryDays, setExpiryDays] = useState("14")
  const [revokeTarget, setRevokeTarget] = useState<AccessCodeRecord | null>(null)

  const activeCohorts = useMemo(
    () => cohorts.filter((item) => item.status === "active"),
    [cohorts],
  )
  const selectedCohortId = activeCohorts.some((item) => item.id === cohort)
    ? cohort
    : (activeCohorts[0]?.id ?? "")

  const generateMutation = useMutation({
    mutationFn: generateAccessCodes,
    onSuccess: (_, variables) => {
      setDialogOpen(false)
      setQuantity("1")
      toast.success(
        `${variables.quantity} access code${variables.quantity === 1 ? "" : "s"} generated`,
      )
    },
    onError: () => toast.error("The codes could not be generated. Try again."),
  })
  const revokeMutation = useMutation({
    mutationFn: ({ codeId, currentUser }: { codeId: string; currentUser: NonNullable<typeof user> }) =>
      revokeAccessCode(codeId, currentUser),
    onSuccess: () => {
      if (revokeTarget) toast.success(`${revokeTarget.code} was revoked`)
      setRevokeTarget(null)
    },
    onError: () => toast.error("The code could not be revoked. Refresh and try again."),
  })
  const isGenerating = generateMutation.isPending
  const isRevoking = revokeMutation.isPending

  const unusedCount = codes.filter(
    (item) => effectiveCodeStatus(item) === "unused",
  ).length
  const claimedCount = codes.filter(
    (item) => effectiveCodeStatus(item) === "claimed",
  ).length
  const inactiveCount = codes.filter((item) =>
    ["expired", "revoked"].includes(effectiveCodeStatus(item)),
  ).length

  async function handleGenerateCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!user) {
      toast.error("Your admin session has expired. Sign in again.")
      return
    }

    const safeQuantity = Math.min(
      20,
      Math.max(1, Number.parseInt(quantity, 10) || 1),
    )
    const selectedCohort = activeCohorts.find((item) => item.id === selectedCohortId)
    if (!selectedCohort) {
      toast.error("Choose an active cohort before generating codes.")
      return
    }

    generateMutation.mutate({
      quantity: safeQuantity,
      cohortId: selectedCohort.id,
      expiryDays: Number(expiryDays),
    })
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast.success("Access code copied")
    } catch {
      toast.error("Copy failed. Select the code and copy it manually.")
    }
  }

  function handleRevoke() {
    if (!revokeTarget) return

    if (!user) {
      toast.error("Your admin session has expired. Sign in again.")
      return
    }
    revokeMutation.mutate({ codeId: revokeTarget.id, currentUser: user })
  }

  const codeColumns = accessCodeColumnHelper.columns([
    accessCodeColumnHelper.accessor("code", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Code" />
      ),
      cell: ({ getValue }) => <span className="font-mono font-medium">{getValue()}</span>,
    }),
    accessCodeColumnHelper.accessor((item) => effectiveCodeStatus(item), {
      id: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ getValue }) => statusBadge(getValue()),
    }),
    accessCodeColumnHelper.accessor("cohortName", {
      id: "cohort",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Cohort" />
      ),
    }),
    accessCodeColumnHelper.accessor((item) => item.expiresAt.getTime(), {
      id: "expires",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Expires" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{formatDate(row.original.expiresAt)}</span>
      ),
    }),
    accessCodeColumnHelper.accessor((item) => item.claimedByName ?? "", {
      id: "claimedBy",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Claimed by" />
      ),
      cell: ({ getValue }) => getValue() || "—",
    }),
    accessCodeColumnHelper.display({
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original
        const currentStatus = effectiveCodeStatus(item)

        return (
          <DataTableRowActions
            label={`Actions for ${item.code}`}
            actions={[
              {
                label: "Copy code",
                icon: ClipboardIcon,
                disabled: currentStatus !== "unused",
                onSelect: () => void copyCode(item.code),
              },
              {
                label: "Revoke code",
                icon: BanIcon,
                variant: "destructive",
                separatorBefore: true,
                disabled: currentStatus !== "unused",
                onSelect: () => setRevokeTarget(item),
              },
            ]}
          />
        )
      },
    }),
  ])

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Registrations & codes
          </h1>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => !isGenerating && setDialogOpen(open)}
        >
          <DialogTrigger render={<Button className="min-h-11 sm:min-h-8" />}>
            <PlusIcon data-icon="inline-start" />
            Generate codes
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleGenerateCodes} className="contents">
              <DialogHeader>
                <DialogTitle>Generate access codes</DialogTitle>
                <DialogDescription>
                  Codes are saved immediately and intended for one successful
                  registration each.
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field data-disabled={isGenerating || undefined}>
                  <FieldLabel htmlFor="quantity">Number of codes</FieldLabel>
                  <Input
                    id="quantity"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="20"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className="h-11 sm:h-8"
                    disabled={isGenerating}
                    required
                  />
                  <FieldDescription>
                    Generate between 1 and 20 codes.
                  </FieldDescription>
                </Field>
                <Field data-disabled={isGenerating || undefined}>
                  <FieldLabel htmlFor="cohort">Cohort</FieldLabel>
                  <Select
                    items={activeCohorts.map((item) => ({
                      label: item.name,
                      value: item.id,
                    }))}
                    value={selectedCohortId}
                    onValueChange={(value) => value && setCohort(value)}
                    disabled={isGenerating}
                  >
                    <SelectTrigger id="cohort" className="h-11 w-full sm:h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {activeCohorts.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {activeCohorts.length === 0 && (
                    <FieldDescription>Create or activate a cohort first.</FieldDescription>
                  )}
                </Field>
                <Field data-disabled={isGenerating || undefined}>
                  <FieldLabel htmlFor="expiry">Expires after</FieldLabel>
                  <Select
                    items={expiryItems}
                    value={expiryDays}
                    onValueChange={(value) => value && setExpiryDays(value)}
                    disabled={isGenerating}
                  >
                    <SelectTrigger id="expiry" className="h-11 w-full sm:h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {expiryItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <DialogClose
                  render={
                    <Button type="button" variant="outline" disabled={isGenerating} />
                  }
                >
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={isGenerating || !selectedCohortId}>
                  {isGenerating ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Saving codes
                    </>
                  ) : (
                    <>
                      <KeyRoundIcon data-icon="inline-start" />
                      Generate
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </section>

      {(codesQuery.error || cohortsQuery.error) && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Access codes unavailable</AlertTitle>
          <AlertDescription>{codesQuery.error?.message ?? cohortsQuery.error?.message}</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Available</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {isLoading ? <Skeleton className="h-9 w-12" /> : unusedCount}
            </CardTitle>
            <CardAction>
              <KeyRoundIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unused codes ready to share
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Claimed</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {isLoading ? <Skeleton className="h-9 w-12" /> : claimedCount}
            </CardTitle>
            <CardAction>
              <UserRoundCheckIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Registrations started from a code
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Inactive</CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {isLoading ? <Skeleton className="h-9 w-12" /> : inactiveCount}
            </CardTitle>
            <CardAction>
              <ShieldCheckIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Expired or manually revoked codes
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="flex-1">
        <CardHeader className="border-b"><CardTitle>Code inventory</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex flex-col gap-3 p-4" role="status">
              <span className="sr-only">Loading code inventory</span>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          )}

          {!isLoading && codes.length > 0 && (
            <DataTable
              columns={codeColumns}
              data={codes}
              searchPlaceholder="Filter access codes..."
              searchAccessor={(item) =>
                [
                  item.code,
                  item.cohortName,
                  effectiveCodeStatus(item),
                  item.claimedByName ?? "",
                ].join(" ")
              }
              columnLabels={{
                code: "Code",
                status: "Status",
                cohort: "Cohort",
                expires: "Expires",
                claimedBy: "Claimed by",
              }}
            />
          )}

          {!isLoading && codes.length === 0 && (
            <Empty className="min-h-64">
              <EmptyHeader>
                <EmptyMedia variant="icon"><KeyRoundIcon /></EmptyMedia>
                <EmptyTitle>No access codes yet</EmptyTitle>
                <EmptyDescription>Generate the first code to begin the admin invitation flow.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" onClick={() => setDialogOpen(true)}>
                  <PlusIcon data-icon="inline-start" />
                  Generate first code
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && !isRevoking && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <BanIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Revoke this access code?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.code} will remain visible for recovery and audit,
              but it can no longer be copied or used for onboarding. This action
              cannot be reversed in the admin portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleRevoke()}
              disabled={isRevoking}
            >
              {isRevoking ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Revoking
                </>
              ) : (
                <>
                  <BanIcon data-icon="inline-start" />
                  Revoke code
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
