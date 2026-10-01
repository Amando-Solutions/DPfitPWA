import { firestore } from '../utils/firebase'
import { cohortFallbacks, loadChallenge } from '../utils/cohort'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  try {
    return (await loadChallenge(firestore(), cohortFallbacks()))?.challenge ?? null
  } catch (cause) {
    console.error('[challenge] could not resolve the active cohort:', cause)
    throw createError({ statusCode: 503, statusMessage: 'Challenge details are temporarily unavailable.' })
  }
})
