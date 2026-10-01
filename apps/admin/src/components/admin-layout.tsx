import { Outlet } from "react-router-dom"

import { AppSidebar } from "@/components/app-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { SelectedCohortProvider } from "@/hooks/use-selected-cohort"

export function AdminLayout() {
  return (
    <SelectedCohortProvider>
      <SidebarProvider>
        <a
          href="#admin-content"
          className="fixed top-3 left-3 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
        >
          Skip to main content
        </a>
        <AppSidebar />
        <SidebarInset id="admin-content" tabIndex={-1}>
          <AdminHeader />
          <div className="flex flex-1 flex-col px-4 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-9">
            <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
              <Outlet />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SelectedCohortProvider>
  )
}
