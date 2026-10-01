import { useMemo, useState } from "react"
import { createColumnHelper } from "@tanstack/react-table"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleIcon,
  PauseCircleIcon,
  UsersIcon,
} from "lucide-react"
import { useNavigate } from "react-router-dom"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useMembersQuery } from "@/hooks/use-admin-queries"
import {
  humanizeMemberValue,
  memberAdherence,
  memberDashboardStatus,
  memberGoalLabel,
  type MemberDashboardStatus,
} from "@/lib/member-dashboard"
import type { MemberRecord } from "@/lib/members"

const memberColumnHelper = createColumnHelper<DataTableFeatures, MemberRecord>()

type MemberStatusFilter = "all" | MemberDashboardStatus

function statusBadge(status: MemberDashboardStatus) {
  if (status === "needs-attention") {
    return (
      <Badge variant="destructive">
        <CircleIcon fill="currentColor" data-icon="inline-start" /> Needs attention
      </Badge>
    )
  }
  if (status === "active") {
    return (
      <Badge variant="secondary">
        <CheckCircle2Icon data-icon="inline-start" /> Active
      </Badge>
    )
  }
  if (status === "paused") {
    return (
      <Badge variant="outline">
        <PauseCircleIcon data-icon="inline-start" /> Paused
      </Badge>
    )
  }
  if (status === "completed") return <Badge variant="secondary">Completed</Badge>
  return <Badge variant="outline">Onboarding</Badge>
}

function isStatusFilter(value: string): value is MemberStatusFilter {
  return ["all", "needs-attention", "active", "paused", "onboarding", "completed"].includes(value)
}

export function MembersPage() {
  const navigate = useNavigate()
  const membersQuery = useMembersQuery()
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>("all")
  const isLoading = membersQuery.isPending

  const filteredMembers = useMemo(
    () => statusFilter === "all"
      ? members
      : members.filter((member) => memberDashboardStatus(member) === statusFilter),
    [members, statusFilter],
  )

  const memberColumns = useMemo(
    () => memberColumnHelper.columns([
      memberColumnHelper.accessor((member) => member.profile.displayName, {
        id: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ getValue }) => <span className="font-semibold">{getValue()}</span>,
      }),
      memberColumnHelper.accessor((member) => memberGoalLabel(member.profile.goal), {
        id: "goal",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Goal" />,
      }),
      memberColumnHelper.accessor((member) => humanizeMemberValue(member.profile.callSlot), {
        id: "callSlot",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Call slot" />,
      }),
      memberColumnHelper.accessor((member) => memberAdherence(member) ?? -1, {
        id: "adherence",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Adherence" />,
        cell: ({ getValue }) => getValue() < 0 ? (
          <span className="text-muted-foreground">Not yet</span>
        ) : (
          <span className="font-mono tabular-nums">{getValue()}%</span>
        ),
      }),
      memberColumnHelper.accessor((member) => memberDashboardStatus(member), {
        id: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ getValue }) => statusBadge(getValue()),
      }),
    ]),
    [],
  )

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has claimed an access code across your cohorts.
        </p>
      </section>

      {membersQuery.error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Members unavailable</AlertTitle>
          <AlertDescription>{membersQuery.error.message}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="flex flex-col gap-3" role="status">
          <span className="sr-only">Loading members</span>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-8 w-40" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      )}

      {!isLoading && members.length > 0 && (
        <DataTable
          columns={memberColumns}
          data={filteredMembers}
          className="p-0"
          pageSize={12}
          searchPlaceholder="Search by name..."
          searchAccessor={(member) => [
            member.profile.displayName,
            member.email,
            member.cohortName,
            memberGoalLabel(member.profile.goal),
            humanizeMemberValue(member.profile.callSlot),
          ].join(" ")}
          showColumnVisibility={false}
          toolbarAfterSearch={(
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                if (value && isStatusFilter(value)) setStatusFilter(value)
              }}
            >
              <SelectTrigger className="h-11 w-full sm:h-8 sm:w-48" aria-label="Filter members by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="needs-attention">Needs attention</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          columnLabels={{
            name: "Name",
            goal: "Goal",
            callSlot: "Call slot",
            adherence: "Adherence",
            status: "Status",
          }}
          onRowClick={(member) => navigate(`/members/${encodeURIComponent(member.id)}`)}
          getRowLabel={(member) => `Open ${member.profile.displayName}`}
        />
      )}

      {!isLoading && members.length === 0 && !membersQuery.error && (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><UsersIcon /></EmptyMedia>
            <EmptyTitle>No members yet</EmptyTitle>
            <EmptyDescription>Claimed access codes will create the first member records.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
