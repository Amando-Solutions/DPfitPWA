import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

function readArgument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const email = readArgument("email")?.trim().toLowerCase()
const password = process.env.DPFIT_ADMIN_PASSWORD ?? readArgument("password")
const projectId = readArgument("project") ?? process.env.FIREBASE_PROJECT_ID
const checkOnly = process.argv.includes("--check")
const claimOnly = process.argv.includes("--claim-only")

if (!email || !projectId || (!password && !checkOnly && !claimOnly)) {
  console.error(
    "Usage: DPFIT_ADMIN_PASSWORD=<password> npm run admin:provision -- --project <project-id> --email <email> [--check | --claim-only]",
  )
  process.exit(1)
}

if (!checkOnly && !claimOnly && password.length < 12) {
  console.error("Use an admin password of at least 12 characters.")
  process.exit(1)
}

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
  })
}

const auth = getAuth()
let adminUser
let action

if (checkOnly) {
  try {
    const existingUser = await auth.getUserByEmail(email)
    console.log(`Firebase Admin access verified for project: ${projectId}`)
    console.log(`Auth user exists: ${existingUser.email}`)
    console.log(
      `Admin claim present: ${existingUser.customClaims?.dpfitAdmin === true ? "yes" : "no"}`,
    )
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error
    }

    console.log(`Firebase Admin access verified for project: ${projectId}`)
    console.log(`Auth user does not exist yet: ${email}`)
  }

  process.exit(0)
}

async function removeAdminClaimFromOtherUsers(selectedUid) {
  let pageToken

  do {
    const page = await auth.listUsers(1000, pageToken)

    for (const user of page.users) {
      if (user.uid === selectedUid || user.customClaims?.dpfitAdmin !== true) {
        continue
      }

      const remainingClaims = { ...user.customClaims }
      delete remainingClaims.dpfitAdmin
      await auth.setCustomUserClaims(user.uid, remainingClaims)
      console.log(`Removed prior admin access from: ${user.email ?? user.uid}`)
    }

    pageToken = page.pageToken
  } while (pageToken)
}

if (claimOnly) {
  try {
    adminUser = await auth.getUserByEmail(email)
    action = "authorized"
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      console.error(
        `Auth user not found: ${email}. Create it in Firebase Authentication first.`,
      )
      process.exit(1)
    }
    throw error
  }
} else {
  try {
    adminUser = await auth.getUserByEmail(email)
    adminUser = await auth.updateUser(adminUser.uid, {
      displayName: "DP Fit Admin",
      emailVerified: true,
      password,
      disabled: false,
    })
    action = "updated"
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error
    }

    adminUser = await auth.createUser({
      displayName: "DP Fit Admin",
      email,
      emailVerified: true,
      password,
      disabled: false,
    })
    action = "created"
  }
}

await auth.setCustomUserClaims(adminUser.uid, {
  ...adminUser.customClaims,
  dpfitAdmin: true,
})
await removeAdminClaimFromOtherUsers(adminUser.uid)

console.log(`DP Fit admin ${action}: ${adminUser.email}`)
console.log("The dpfitAdmin claim is active. Existing sessions must sign in again.")
