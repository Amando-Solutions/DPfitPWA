// =============================================================================
// POST /api/preorder/release — send the access codes a pre-order held.
//
// Called every hour by `releasePreorderCodes` in `apps/functions`, and safe to
// call by hand: a run before a pre-order closes sends nothing, and a run after
// sends only what is still held. See `server/utils/release.ts`.
//
//   curl -X POST https://<site>/api/preorder/release \
//     -H "Authorization: Bearer $NUXT_PREORDER_RELEASE_SECRET"
//
// Answers with counts, and `remaining` above zero when the time budget ran out
// before every due code was sent; the caller asks again until it is zero.
//
// It lives here rather than in `apps/functions` because everything it needs
// is here: the Brevo sender and email design, and the environment fallbacks
// for a cohort's pre-order window, which the functions never see.
// =============================================================================
import { createHash, timingSafeEqual } from 'node:crypto'
import { brevoConfig } from '../../utils/email'
import { firestore } from '../../utils/firebase'
import { releaseHeldCodes } from '../../utils/release'

/** Hashed first so the comparison is constant-time at any length; see `isFromSelar`. */
const matches = (secret: string, given: string) =>
  timingSafeEqual(
    createHash('sha256').update(secret, 'utf8').digest(),
    createHash('sha256').update(given, 'utf8').digest(),
  )

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.preorderReleaseSecret) {
    console.error(
      '[release] NUXT_PREORDER_RELEASE_SECRET is not set, so codes held during a pre-order ' +
        'are never sent. Set it here and as PREORDER_RELEASE_SECRET on the functions.',
    )
    throw createError({ statusCode: 503, statusMessage: 'Not configured.' })
  }

  const token = (getHeader(event, 'authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token || !matches(config.preorderReleaseSecret, token)) {
    throw createError({ statusCode: 401, statusMessage: 'Bad token.' })
  }

  const result = await releaseHeldCodes(firestore(), {
    appUrl: config.public.appUrl,
    codeTtlDaysFallback: config.registrationCodeTtlDays,
    preorderFallback: {
      preorderStartsAt: config.registrationPreorderStartsAt,
      preorderEndsAt: config.registrationPreorderEndsAt,
    },
    brevo: brevoConfig(),
  })
  if (result.released || result.failed || result.skipped) console.info('[release]', result)
  return { ok: true, ...result }
})
