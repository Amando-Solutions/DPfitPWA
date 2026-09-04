export interface NavItem {
  key: string
  label: string
  /** Longer label used by the desktop side nav, where there is room for it. */
  desktopLabel?: string
  icon: string
  to: string
  /** Rendered as the raised centre action in the mobile tab bar. */
  center?: boolean
}

export const navItems: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home', to: '/home' },
  { key: 'chat', label: 'Chat', desktopLabel: 'Cohort chat', icon: 'chat', to: '/chat' },
  { key: 'train', label: 'Train', desktopLabel: 'Log a workout', icon: 'train', to: '/train', center: true },
  { key: 'fuel', label: 'Fuel', desktopLabel: 'Daily fuel', icon: 'fuel', to: '/nutrition' },
  { key: 'more', label: 'More', icon: 'more', to: '/more' },
]

/**
 * Shared navigation model for both the mobile tab bar and the desktop side nav,
 * so the two can never drift apart.
 */
export const useNavigation = () => {
  const route = useRoute()

  const isActive = (to: string) =>
    route.path === to || route.path.startsWith(to + '/')

  return { navItems, isActive }
}
