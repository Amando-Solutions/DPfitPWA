/** Read-only deployment check: bun --env-file=.env scripts/check-cohort.ts */
import { readFileSync } from 'node:fs'
import { cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadChallenge } from '../server/utils/cohort'

const raw = process.env.NUXT_FIREBASE_SERVICE_ACCOUNT?.trim()
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
if (!raw && !keyFile) throw new Error('Configure Firebase server credentials before running this check.')
const key = JSON.parse(raw
  ? (raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  : readFileSync(keyFile!, 'utf8'))
const app = initializeApp({ credential: cert(key), projectId: key.project_id })
const databaseId = process.env.NUXT_FIREBASE_DATABASE_ID?.trim() || '(default)'
const db = getFirestore(app, databaseId)
const timeout = setTimeout(() => { console.error('Firestore read timed out.'); process.exit(1) }, 25_000)
try {
  const active = await loadChallenge(db, {
    cohortId: process.env.NUXT_REGISTRATION_COHORT_ID,
    price: process.env.NUXT_PUBLIC_PRICE,
    currency: process.env.NUXT_PUBLIC_PRICE_CURRENCY,
    codeTtlDays: process.env.NUXT_REGISTRATION_CODE_TTL_DAYS,
  })
  console.log(JSON.stringify({ databaseId, challenge: active?.challenge ?? null }, null, 2))
} finally {
  clearTimeout(timeout)
  await db.terminate()
  await deleteApp(app)
}
