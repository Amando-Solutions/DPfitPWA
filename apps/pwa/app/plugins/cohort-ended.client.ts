import { COHORT_ENDED_ROUTE } from '~/middleware/auth.global'

/**
 * Follows the `ended` gate while the app is open.
 *
 * The middleware decides it on every navigation, and at boot that is enough:
 * the store has read the cohort before the first route resolves. It is not
 * enough in the two cases where the gate turns with nobody navigating — a
 * sign-in, which routes the moment the membership is known and reads the
 * cohort behind Home, and the cohort ending while members have the app open —
 * an admin archiving it, which the cohort listener delivers live, or its last
 * day running out, which the clock plugin's midnight wake delivers. Either way
 * the member is taken off whatever screen they were on.
 *
 * The other direction too, for an archive undone or an end date moved later:
 * off the ended screen and back through `/`, which decides where they belong. Not when the gate turns
 * because the member signed out: the screen that signed them out is already
 * taking them to the door.
 */
export default defineNuxtPlugin({
  name: 'cohort-ended',
  dependsOn: ['app-store'],

  setup() {
    const store = useAppStore()
    const router = useRouter()

    watch(
      () => store.gate.value === 'ended',
      (ended) => {
        const onEnded = router.currentRoute.value.path === COHORT_ENDED_ROUTE
        if (ended && !onEnded) void router.replace(COHORT_ENDED_ROUTE)
        else if (!ended && onEnded && !store.atTheDoor.value) void router.replace('/')
      },
    )
  },
})
