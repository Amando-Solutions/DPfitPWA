import { useCallback, useMemo } from "react"

import { useRealtimeQuery } from "@/hooks/use-realtime-query"
import { subscribeToPlatformSettings, subscribeToPublicSettings } from "@/lib/platform-settings"
import { subscribeToExerciseLibrary } from "@/lib/exercise-library"
import { subscribeToLiveCalls } from "@/lib/live-calls"
import { subscribeToAnnouncements } from "@/lib/announcements"
import { subscribeToProgramWeeks } from "@/lib/program-weeks"
import { subscribeToAccessCodes } from "@/lib/access-codes"
import {
  subscribeToAdminThreads,
  subscribeToThreadMessages,
  type AdminChatThreadKind,
} from "@/lib/admin-chat"
import { subscribeToCohorts } from "@/lib/cohorts"
import {
  subscribeToMember,
  subscribeToMemberOperations,
  subscribeToMembers,
} from "@/lib/members"
import {
  subscribeToProgram,
  subscribeToProgramGuides,
  subscribeToPrograms,
  subscribeToProgramWorkoutDays,
} from "@/lib/programs"

export const adminQueryKeys = {
  platformSettings: ["platform-settings"] as const,
  publicSettings: ["public-settings"] as const,
  exerciseLibrary: ["exercise-library"] as const,
  liveCalls: ["live-calls"] as const,
  announcements: (cohortId: string) => ["announcements", cohortId] as const,
  programWeeks: (id: string) => ["programs", id, "weeks"] as const,
  accessCodes: ["access-codes"] as const,
  cohorts: ["cohorts"] as const,
  members: ["members"] as const,
  member: (memberId: string) => ["members", memberId] as const,
  memberOperations: (memberId: string) => ["members", memberId, "operations"] as const,
  programs: ["programs"] as const,
  program: (programId: string) => ["programs", programId] as const,
  workoutDays: (programId: string) => ["programs", programId, "workout-days"] as const,
  guides: (programId: string) => ["programs", programId, "guides"] as const,
  chatThreads: (kind: AdminChatThreadKind, cohortKey: string) => ["chat", "threads", kind, cohortKey] as const,
  chatMessages: (cohortId: string, threadId: string) => ["chat", "messages", cohortId, threadId] as const,
}

export function usePlatformSettingsQuery() {
  return useRealtimeQuery({ queryKey: adminQueryKeys.platformSettings, subscribe: subscribeToPlatformSettings })
}

export function usePublicSettingsQuery() {
  return useRealtimeQuery({ queryKey: adminQueryKeys.publicSettings, subscribe: subscribeToPublicSettings })
}

export function useAnnouncementsQuery(cohortId: string) {
  const queryKey = useMemo(() => adminQueryKeys.announcements(cohortId), [cohortId])
  const subscribe = useCallback((onData: Parameters<typeof subscribeToAnnouncements>[1], onError: Parameters<typeof subscribeToAnnouncements>[2]) => subscribeToAnnouncements(cohortId, onData, onError), [cohortId])
  return useRealtimeQuery({ queryKey, subscribe, enabled: Boolean(cohortId) })
}

export function useLiveCallsQuery() {
  return useRealtimeQuery({ queryKey: adminQueryKeys.liveCalls, subscribe: subscribeToLiveCalls })
}

export function useExerciseLibraryQuery() {
  return useRealtimeQuery({ queryKey: adminQueryKeys.exerciseLibrary, subscribe: subscribeToExerciseLibrary })
}

export function useProgramWeeksQuery(programId: string) {
  const queryKey = useMemo(() => adminQueryKeys.programWeeks(programId), [programId])
  const subscribe = useCallback((onData: Parameters<typeof subscribeToProgramWeeks>[1], onError: Parameters<typeof subscribeToProgramWeeks>[2]) => subscribeToProgramWeeks(programId, onData, onError), [programId])
  return useRealtimeQuery({ queryKey, subscribe, enabled: Boolean(programId) })
}

export function useAccessCodesQuery() {
  return useRealtimeQuery({ queryKey: adminQueryKeys.accessCodes, subscribe: subscribeToAccessCodes })
}

export function useCohortsQuery() {
  return useRealtimeQuery({ queryKey: adminQueryKeys.cohorts, subscribe: subscribeToCohorts })
}

export function useMembersQuery() {
  return useRealtimeQuery({ queryKey: adminQueryKeys.members, subscribe: subscribeToMembers })
}

export function useMemberQuery(memberId: string) {
  const queryKey = useMemo(() => adminQueryKeys.member(memberId), [memberId])
  const subscribe = useCallback(
    (onData: Parameters<typeof subscribeToMember>[1], onError: Parameters<typeof subscribeToMember>[2]) =>
      subscribeToMember(memberId, onData, onError),
    [memberId],
  )
  return useRealtimeQuery({
    queryKey,
    subscribe,
    enabled: Boolean(memberId),
  })
}

export function useMemberOperationsQuery(memberId: string) {
  const queryKey = useMemo(() => adminQueryKeys.memberOperations(memberId), [memberId])
  const subscribe = useCallback(
    (onData: Parameters<typeof subscribeToMemberOperations>[1], onError: Parameters<typeof subscribeToMemberOperations>[2]) =>
      subscribeToMemberOperations(memberId, onData, onError),
    [memberId],
  )
  return useRealtimeQuery({
    queryKey,
    subscribe,
    enabled: Boolean(memberId),
  })
}

export function useProgramsQuery() {
  return useRealtimeQuery({ queryKey: adminQueryKeys.programs, subscribe: subscribeToPrograms })
}

export function useProgramQuery(programId: string) {
  const queryKey = useMemo(() => adminQueryKeys.program(programId), [programId])
  const subscribe = useCallback(
    (onData: Parameters<typeof subscribeToProgram>[1], onError: Parameters<typeof subscribeToProgram>[2]) =>
      subscribeToProgram(programId, onData, onError),
    [programId],
  )
  return useRealtimeQuery({
    queryKey,
    subscribe,
    enabled: Boolean(programId),
  })
}

export function useProgramWorkoutDaysQuery(programId: string) {
  const queryKey = useMemo(() => adminQueryKeys.workoutDays(programId), [programId])
  const subscribe = useCallback(
    (onData: Parameters<typeof subscribeToProgramWorkoutDays>[1], onError: Parameters<typeof subscribeToProgramWorkoutDays>[2]) =>
      subscribeToProgramWorkoutDays(programId, onData, onError),
    [programId],
  )
  return useRealtimeQuery({
    queryKey,
    subscribe,
    enabled: Boolean(programId),
  })
}

export function useProgramGuidesQuery(programId: string) {
  const queryKey = useMemo(() => adminQueryKeys.guides(programId), [programId])
  const subscribe = useCallback(
    (onData: Parameters<typeof subscribeToProgramGuides>[1], onError: Parameters<typeof subscribeToProgramGuides>[2]) =>
      subscribeToProgramGuides(programId, onData, onError),
    [programId],
  )
  return useRealtimeQuery({
    queryKey,
    subscribe,
    enabled: Boolean(programId),
  })
}

export function useAdminThreadsQuery(cohortIds: string[], kind: AdminChatThreadKind) {
  const cohortKey = useMemo(() => [...cohortIds].sort().join("|"), [cohortIds])
  const queryKey = useMemo(() => adminQueryKeys.chatThreads(kind, cohortKey), [cohortKey, kind])
  const subscribe = useCallback(
    (onData: Parameters<typeof subscribeToAdminThreads>[2], onError: Parameters<typeof subscribeToAdminThreads>[3]) =>
      subscribeToAdminThreads(cohortKey ? cohortKey.split("|") : [], kind, onData, onError),
    [cohortKey, kind],
  )
  return useRealtimeQuery({
    queryKey,
    subscribe,
    enabled: Boolean(cohortKey),
  })
}

export function useThreadMessagesQuery(cohortId: string, threadId: string) {
  const queryKey = useMemo(
    () => adminQueryKeys.chatMessages(cohortId, threadId),
    [cohortId, threadId],
  )
  const subscribe = useCallback(
    (onData: Parameters<typeof subscribeToThreadMessages>[2], onError: Parameters<typeof subscribeToThreadMessages>[3]) =>
      subscribeToThreadMessages(cohortId, threadId, onData, onError),
    [cohortId, threadId],
  )
  return useRealtimeQuery({
    queryKey,
    subscribe,
    enabled: Boolean(cohortId && threadId),
  })
}
