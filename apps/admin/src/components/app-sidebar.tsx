import { NavLink, useLocation, useNavigate } from "react-router-dom"
import {
  ActivityIcon,
  CalendarRangeIcon,
  ChartColumnIcon,
  ChevronsUpDownIcon,
  CirclePlayIcon,
  ClipboardCheckIcon,
  InboxIcon,
  LibraryIcon,
  LogOutIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  MessageSquareTextIcon,
  SettingsIcon,
  TrophyIcon,
  UsersIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAdminAuth } from "@/hooks/use-admin-auth"
import { useCohortPulse } from "@/hooks/use-cohort-pulse"
import { useSelectedCohort } from "@/hooks/use-selected-cohort"
import { pendingSignups } from "@/lib/cohort-pulse"

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  match: (pathname: string) => boolean
  /** A live count shown beside the item, from the selected cohort's cached pulse read. */
  badge?: "attention" | "signups"
}

const exact = (to: string) => (pathname: string) => pathname === to
const within = (to: string) => (pathname: string) => pathname === to || pathname.startsWith(`${to}/`)

const navigation: Array<{ label: string; items: NavItem[] }> = [
  { label: "Overview", items: [
    { to: "/cohort-pulse", label: "Cohort Pulse", icon: ActivityIcon, match: exact("/cohort-pulse"), badge: "attention" },
    { to: "/analytics", label: "Reports & Analytics", icon: ChartColumnIcon, match: exact("/analytics") },
  ] },
  { label: "People", items: [
    { to: "/access-codes", label: "Registrations & Codes", icon: InboxIcon, match: exact("/access-codes"), badge: "signups" },
    { to: "/members", label: "Members", icon: UsersIcon, match: within("/members") },
    { to: "/cohorts", label: "Cohorts", icon: CalendarRangeIcon, match: exact("/cohorts") },
  ] },
  { label: "Programming", items: [
    { to: "/programs", label: "Programs", icon: LibraryIcon, match: within("/programs") },
    { to: "/exercise-library", label: "Exercise Library", icon: VideoIcon, match: exact("/exercise-library") },
    { to: "/live-calls", label: "Live Calls", icon: CirclePlayIcon, match: exact("/live-calls") },
  ] },
  { label: "Engagement", items: [
    { to: "/workout-sessions", label: "Workout Sessions", icon: ClipboardCheckIcon, match: exact("/workout-sessions") },
    { to: "/feedback", label: "Feedback", icon: MessageSquareIcon, match: exact("/feedback") },
    { to: "/leaderboard", label: "Leaderboard", icon: TrophyIcon, match: exact("/leaderboard") },
    { to: "/announcements", label: "Announcements", icon: MegaphoneIcon, match: exact("/announcements") },
    { to: "/admin-chat", label: "Chat", icon: MessageSquareTextIcon, match: within("/admin-chat") },
  ] },
  { label: "System", items: [
    { to: "/settings", label: "Settings", icon: SettingsIcon, match: exact("/settings") },
  ] },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const { user, signOut } = useAdminAuth()
  const navigate = useNavigate()
  // Land on a clean login page: without this, the login page remembers the page
  // you signed out from and sends the next sign-in back there instead of to Cohort Pulse.
  async function handleSignOut() {
    await signOut()
    navigate("/login", { replace: true, state: null })
  }
  const { cohort } = useSelectedCohort()
  const { issues, query, membersQuery } = useCohortPulse(cohort)
  const attentionCount = new Set(issues.map((issue) => issue.memberId)).size
  const signupCount = query.data ? pendingSignups(query.data, membersQuery.data ?? []) : 0
  const adminEmail = user?.email ?? "Provisioned admin"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<NavLink to="/cohort-pulse" />}
              onClick={() => setOpenMobile(false)}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-mono text-xs font-semibold text-sidebar-primary-foreground">
                DP
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold tracking-tight">DP FIT</span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  Admin operations
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navigation.map((group) => <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const badge = item.badge === "attention" ? attentionCount : item.badge === "signups" ? signupCount : 0
                return <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton render={<NavLink to={item.to} />} isActive={item.match(pathname)} tooltip={item.label} onClick={() => setOpenMobile(false)}>
                    <item.icon /><span>{item.label}</span>
                  </SidebarMenuButton>
                  {badge > 0 && <SidebarMenuBadge className="bg-destructive text-white peer-data-active/menu-button:text-white peer-hover/menu-button:text-white rounded-full" aria-label={`${badge} ${item.badge === "attention" ? "need attention" : "pending"}`}>{badge}</SidebarMenuBadge>}
                </SidebarMenuItem>
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>)}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <Avatar size="sm">
                  <AvatarFallback>DO</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-sm font-medium">DP Fit admin</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    {adminEmail}
                  </span>
                </span>
                <ChevronsUpDownIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Admin workspace</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => void handleSignOut()}>
                    <LogOutIcon />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
