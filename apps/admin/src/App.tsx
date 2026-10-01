import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router-dom"

import { AdminLayout } from "@/components/admin-layout"
import { AdminRoute } from "@/components/admin-route"
import { Skeleton } from "@/components/ui/skeleton"
import { LoginPage } from "@/pages/login-page"

const AccessCodesPage = lazy(() =>
  import("@/pages/access-codes-page").then((module) => ({
    default: module.AccessCodesPage,
  })),
)

const CohortsPage = lazy(() =>
  import("@/pages/cohorts-page").then((module) => ({
    default: module.CohortsPage,
  })),
)

const MembersPage = lazy(() =>
  import("@/pages/members-page").then((module) => ({
    default: module.MembersPage,
  })),
)

const ProgramsPage = lazy(() =>
  import("@/pages/programs-page").then((module) => ({
    default: module.ProgramsPage,
  })),
)

const ExerciseLibraryPage = lazy(() => import("@/pages/exercise-library-page").then((module) => ({ default: module.ExerciseLibraryPage })))
const LiveCallsPage = lazy(() => import("@/pages/live-calls-page").then((module) => ({ default: module.LiveCallsPage })))
const WorkoutSessionsPage = lazy(() => import("@/pages/workout-sessions-page").then((module) => ({ default: module.WorkoutSessionsPage })))
const FeedbackPage = lazy(() => import("@/pages/feedback-page").then((module) => ({ default: module.FeedbackPage })))
const LeaderboardPage = lazy(() => import("@/pages/leaderboard-page").then((module) => ({ default: module.LeaderboardPage })))
const AnnouncementsPage = lazy(() => import("@/pages/announcements-page").then((module) => ({ default: module.AnnouncementsPage })))
const CohortPulsePage = lazy(() => import("@/pages/cohort-pulse-page").then((module) => ({ default: module.CohortPulsePage })))
const AnalyticsPage = lazy(() => import("@/pages/analytics-page").then((module) => ({ default: module.AnalyticsPage })))
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })))

const ProgramDetailPage = lazy(() =>
  import("@/pages/program-detail-page").then((module) => ({
    default: module.ProgramDetailPage,
  })),
)

const MemberOperationsPage = lazy(() =>
  import("@/pages/member-operations-page").then((module) => ({
    default: module.MemberOperationsPage,
  })),
)

const AdminChatPage = lazy(() =>
  import("@/pages/admin-chat-page").then((module) => ({
    default: module.AdminChatPage,
  })),
)

function PageFallback() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading page">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<AdminRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/cohort-pulse" replace />} />
          <Route path="cohort-pulse" element={<Suspense fallback={<PageFallback />}><CohortPulsePage /></Suspense>} />
          <Route path="analytics" element={<Suspense fallback={<PageFallback />}><AnalyticsPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
          <Route path="exercise-library" element={<Suspense fallback={<PageFallback />}><ExerciseLibraryPage /></Suspense>} />
          <Route path="live-calls" element={<Suspense fallback={<PageFallback />}><LiveCallsPage /></Suspense>} />
          <Route path="workout-sessions" element={<Suspense fallback={<PageFallback />}><WorkoutSessionsPage /></Suspense>} />
          <Route path="feedback" element={<Suspense fallback={<PageFallback />}><FeedbackPage /></Suspense>} />
          <Route path="leaderboard" element={<Suspense fallback={<PageFallback />}><LeaderboardPage /></Suspense>} />
          <Route path="announcements" element={<Suspense fallback={<PageFallback />}><AnnouncementsPage /></Suspense>} />
          <Route
            path="access-codes"
            element={
              <Suspense fallback={<PageFallback />}>
                <AccessCodesPage />
              </Suspense>
            }
          />
          <Route
            path="cohorts"
            element={
              <Suspense fallback={<PageFallback />}>
                <CohortsPage />
              </Suspense>
            }
          />
          <Route
            path="members"
            element={
              <Suspense fallback={<PageFallback />}>
                <MembersPage />
              </Suspense>
            }
          />
          <Route
            path="programs"
            element={
              <Suspense fallback={<PageFallback />}>
                <ProgramsPage />
              </Suspense>
            }
          />
          <Route
            path="programs/:programId"
            element={
              <Suspense fallback={<PageFallback />}>
                <ProgramDetailPage />
              </Suspense>
            }
          />
          <Route
            path="members/:memberId"
            element={
              <Suspense fallback={<PageFallback />}>
                <MemberOperationsPage />
              </Suspense>
            }
          />
          <Route
            path="admin-chat"
            element={
              <Suspense fallback={<PageFallback />}>
                <AdminChatPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/cohort-pulse" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
