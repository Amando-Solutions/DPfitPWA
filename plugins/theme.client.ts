/**
 * Applies the stored theme as soon as the app boots and keeps it in step with
 * the OS while the member is on `system`.
 *
 * The *first* paint is handled earlier still, by the inline script in
 * `nuxt.config.ts` — this plugin only takes over once Vue is running.
 */
export default defineNuxtPlugin(() => {
  const theme = useTheme()
  theme.apply()
  theme.watchSystem()
})
