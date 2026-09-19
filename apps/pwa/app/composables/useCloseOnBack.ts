/** The slice of `CloseWatcher` used here. TypeScript's DOM lib doesn't ship it yet. */
interface CloseWatcherLike {
  onclose: (() => void) | null
  destroy(): void
}
type CloseWatcherConstructor = new () => CloseWatcherLike

/**
 * Android's back button closes the sheet or dialog on top, as it does in every
 * native app, instead of navigating away from the screen underneath it.
 *
 * `CloseWatcher` is the platform's own hook for this: while one is live, the
 * system back reaches it as a close request and never reaches history. Chrome
 * on Android has it. Where it is missing, back navigates as it always did.
 *
 * Android only. Desktop Chromium has `CloseWatcher` too, but there it answers
 * to Escape, which Reka's dialogs already handle themselves.
 */
export const useCloseOnBack = (open: Readonly<Ref<boolean>>, close: () => void) => {
  const { platform } = usePlatform()
  if (import.meta.server || platform.value !== 'android') return

  const Watcher = (window as Window & { CloseWatcher?: CloseWatcherConstructor })
    .CloseWatcher
  if (!Watcher) return

  let watcher: CloseWatcherLike | null = null
  const release = () => {
    watcher?.destroy()
    watcher = null
  }

  watch(
    open,
    (isOpen) => {
      release()
      if (!isOpen) return
      try {
        watcher = new Watcher()
      } catch {
        // Refused, which the spec allows. Back then navigates, as before.
        return
      }
      watcher.onclose = () => {
        // A watcher that has fired is spent; the browser discards it.
        watcher = null
        close()
      }
    },
    { immediate: true },
  )

  onScopeDispose(release)
}
