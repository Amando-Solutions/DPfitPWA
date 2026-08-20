import { storage } from '~/lib/storage'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** Key inside the app's storage namespace. Mirrored by the pre-paint script in
 *  `nuxt.config.ts` — change one and you must change the other. */
export const THEME_KEY = 'theme'

const MEDIA = '(prefers-color-scheme: dark)'

/** The colour painted behind the OS chrome, per theme. Matches `--surface`. */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#f3eae4',
  dark: '#14101a',
}

const systemPrefersDark = (): boolean =>
  !import.meta.server && window.matchMedia(MEDIA).matches

/**
 * Light/dark theming for the whole app.
 *
 * The member's choice is one of three values, not two: `system` keeps following
 * the OS after the fact, which is why the raw preference and the resolved theme
 * are tracked separately.
 *
 * Nothing here paints directly — it only sets `data-theme` on <html>, and the
 * token layer in `assets/styles/main.css` does the rest.
 */
export const useTheme = () => {
  const preference = useState<ThemePreference>('theme-preference', () =>
    storage.read<ThemePreference>(THEME_KEY, 'system'),
  )
  const systemDark = useState<boolean>('theme-system-dark', systemPrefersDark)

  const resolved = computed<ResolvedTheme>(() =>
    preference.value === 'system'
      ? systemDark.value
        ? 'dark'
        : 'light'
      : preference.value,
  )

  const apply = () => {
    if (import.meta.server) return
    const root = document.documentElement
    root.dataset.theme = resolved.value
    root
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[resolved.value])
  }

  const set = (next: ThemePreference) => {
    preference.value = next
    storage.write(THEME_KEY, next)
    apply()
  }

  /** Flip to the opposite of what is on screen, pinning the result. */
  const toggle = () => set(resolved.value === 'dark' ? 'light' : 'dark')

  /**
   * Wire up the live OS listener. Called once from the theme plugin; safe to
   * call again from a component, which will clean up on unmount.
   */
  const watchSystem = () => {
    if (import.meta.server) return
    const mql = window.matchMedia(MEDIA)
    const onChange = (event: MediaQueryListEvent) => {
      systemDark.value = event.matches
      if (preference.value === 'system') apply()
    }
    mql.addEventListener('change', onChange)
    if (getCurrentInstance()) {
      onScopeDispose(() => mql.removeEventListener('change', onChange))
    }
  }

  return { preference, resolved, set, toggle, apply, watchSystem }
}
