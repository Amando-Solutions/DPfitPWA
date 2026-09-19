import { detectPlatform, isStandalone, type Platform } from '~/lib/platform'

/**
 * The device's navigation conventions, for components that draw them.
 *
 * `standalone` is kept apart from `useInstallApp().isInstalled` on purpose:
 * that one flips the moment an install is accepted, while this answers how the
 * current page was launched, which is what decides whether iOS gives it a back
 * swipe of its own.
 */
export const usePlatform = () => {
  const platform = useState<Platform>('platform', detectPlatform)
  const standalone = useState<boolean>('platform-standalone', isStandalone)
  return { platform, standalone }
}
