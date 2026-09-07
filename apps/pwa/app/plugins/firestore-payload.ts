/**
 * Teaches Nuxt's SSR payload how to carry a Firestore `Timestamp`.
 *
 * State in `useState` is serialised into the HTML on the server and revived on
 * the client. Nothing else is done to it, so a class instance arrives as a bare
 * object: `Timestamp` would survive as `{ seconds, nanoseconds }` with no
 * `toDate()` and no prototype, and the first `.toMillis()` on the client would
 * throw. Every date in the app now goes through this type, so that is every
 * screen.
 *
 * Registering a reducer/reviver pair keeps the instance intact across the
 * boundary. The reducer must return something falsy for values it does not
 * handle, which is what the `instanceof` guard is doing.
 *
 * NOTE: inert as the app is configured today. `nuxt.config.ts` sets
 * `ssr: false`, so there is no server render, no payload serialised into the
 * HTML, and nothing for these to run against — a build emits no `_payload.json`
 * at all, and the only prerendered route is the empty SPA shell. What actually
 * round-trips a `Timestamp` right now is `tagTimestamps`/`reviveTimestamps` in
 * `lib/storage.ts`, which is a separate mechanism over Web Storage.
 *
 * This is kept because it costs nothing and becomes load-bearing the moment
 * `ssr: true` is switched on — at which point every date in the app crosses the
 * payload boundary and would arrive prototype-less without it. Delete it if the
 * app is staying an SPA for good.
 */
import { Timestamp } from 'firebase/firestore'

const TAG = 'FirestoreTimestamp'

export default definePayloadPlugin(() => {
  definePayloadReducer(
    TAG,
    (value: unknown) =>
      value instanceof Timestamp && ([value.seconds, value.nanoseconds] as const),
  )
  definePayloadReviver(TAG, ([seconds, nanoseconds]: [number, number]) =>
    new Timestamp(seconds, nanoseconds),
  )
})
