import { Navigate, Outlet, useLocation } from "react-router-dom"

import { Spinner } from "@/components/ui/spinner"
import { useAdminAuth } from "@/hooks/use-admin-auth"

export function AdminRoute() {
  const location = useLocation()
  const { status } = useAdminAuth()

  if (status === "loading") {
    return (
      <main className="grid min-h-svh place-items-center bg-background px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner />
          Loading..
        </div>
      </main>
    )
  }

  if (status !== "authorized") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
