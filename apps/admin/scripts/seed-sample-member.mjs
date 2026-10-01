import { randomUUID } from "node:crypto"

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore"

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function fail(message) {
  console.error(`Sample member seed failed: ${message}`)
  process.exitCode = 1
}

const projectId = readArgument("--project")
const databaseId = readArgument("--database") ?? "(default)"
const accessCode = readArgument("--code")?.trim().toUpperCase()

if (!projectId || !accessCode || !["(default)", "staging"].includes(databaseId)) {
  fail(
    "provide --project <id>, --database <(default)|staging>, and --code <access-code>.",
  )
} else if (!/^DPF-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(accessCode)) {
  fail("the access code does not match the expected DPF-XXXX-XXXX format.")
} else {
  const app =
    getApps()[0] ??
    initializeApp({ credential: applicationDefault(), projectId })
  const database = databaseId === "(default)"
    ? getFirestore(app)
    : getFirestore(app, databaseId)
  const codeReference = database.collection("accessCodes").doc(accessCode)
  const proposedMemberId = `member-${randomUUID()}`

  try {
    const result = await database.runTransaction(async (transaction) => {
      const codeSnapshot = await transaction.get(codeReference)

      if (!codeSnapshot.exists) {
        throw new Error(`access code ${accessCode} does not exist.`)
      }

      const code = codeSnapshot.data()
      if (!code.programId || typeof code.programVersion !== "number") {
        throw new Error(
          `access code ${accessCode} is missing its programId/programVersion pin.`,
        )
      }
      let memberId = code.claimedByUid ?? code.claimedByMemberId
      let memberReference
      let memberSnapshot

      if (code.status === "unused") {
        const expiresAt = code.expiresAt
        if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= Date.now()) {
          throw new Error(`access code ${accessCode} has expired.`)
        }
        memberId = proposedMemberId
        memberReference = database.collection("members").doc(memberId)
        memberSnapshot = await transaction.get(memberReference)
      } else if (code.status === "claimed" && memberId) {
        memberReference = database.collection("members").doc(memberId)
        memberSnapshot = await transaction.get(memberReference)
        if (!memberSnapshot.exists) {
          throw new Error("the code is claimed but its member record is missing.")
        }
        if (memberSnapshot.data().accessCode !== accessCode) {
          throw new Error("the claimed member does not match this access code.")
        }
      } else {
        throw new Error(`access code ${accessCode} is ${code.status}.`)
      }

      const sessionReference = memberReference
        .collection("sessions")
        .doc("sample-session-week-1")
      const checkInReference = memberReference.collection("checkIns").doc("week-1")
      const eventReference = memberReference
        .collection("lifecycleEvents")
        .doc("sample-bootstrap")
      const [sessionSnapshot, checkInSnapshot, eventSnapshot] = await Promise.all([
        transaction.get(sessionReference),
        transaction.get(checkInReference),
        transaction.get(eventReference),
      ])

      const existingVersion = memberSnapshot.exists
        ? Number(memberSnapshot.data().sampleSeedVersion ?? 0)
        : 0
      const isComplete =
        existingVersion >= 2 &&
        sessionSnapshot.exists &&
        checkInSnapshot.exists &&
        eventSnapshot.exists

      if (isComplete) {
        return { created: false, enriched: false, memberId, writes: 0 }
      }

      const now = Timestamp.now()
      const sessionTime = Timestamp.fromMillis(now.toMillis() - 2 * 60 * 60 * 1000)
      const checkInTime = Timestamp.fromMillis(now.toMillis() - 60 * 60 * 1000)
      const displayName = "Ada Nwosu"

      transaction.set(
        memberReference,
        {
          id: memberId,
          email: "ada.nwosu@example.com",
          emailVerified: true,
          accessCode,
          cohortId: code.cohortId ?? "pilot",
          cohortName: code.cohortName ?? "Pilot cohort",
          programId: code.programId ?? "",
          programVersion: code.programVersion ?? 1,
          status: "active",
          previousStatus: null,
          pauseReason: null,
          pausedAt: null,
          onboardingStep: "complete",
          setupComplete: true,
          isSample: true,
          sampleSeedVersion: 2,
          joinedAt: memberSnapshot.exists
            ? memberSnapshot.data().joinedAt
            : FieldValue.serverTimestamp(),
          createdAt: memberSnapshot.exists
            ? memberSnapshot.data().createdAt
            : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: null,
          updatedByEmail: null,
          lastActiveAt: checkInTime,
          activitySummary: {
            workoutsTotal: 1,
            workoutsThisWeek: 1,
            pendingProofCount: 1,
            latestCheckInAt: checkInTime,
            latestCheckInWeek: 1,
            latestCheckInReviewStatus: "needs-attention",
          },
          profile: {
            displayName,
            whatsapp: "",
            age: 31,
            sex: "female",
            heightCm: 168,
            weightKg: 72.4,
            startWeightKg: 73.2,
            activity: "moderate",
            goal: "recomp",
            trainingDaysPerWeek: 4,
            healthConditions: "Shellfish allergy",
            injuries: "Occasional right-knee tenderness after deep flexion.",
            avatarUrl: "",
          },
          prefs: {},
          stats: {
            points: 45,
            sessionsLogged: 1,
            sessionsQualified: 1,
            checkInsSubmitted: 1,
            photosUploaded: 0,
          },
        },
        { merge: true },
      )

      if (code.status === "unused") {
        transaction.update(codeReference, {
          status: "claimed",
          claimedByUid: memberId,
          claimedByMemberId: FieldValue.delete(),
          claimedByName: displayName,
          claimedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: "system:sample-seed",
          updatedByEmail: "system:sample-seed",
          issuedToEmail: code.issuedToEmail ?? null,
          issuedToWhatsapp: code.issuedToWhatsapp ?? null,
        })
      }

      if (!sessionSnapshot.exists) {
        transaction.create(sessionReference, {
          id: sessionReference.id,
          dayId: "day-1",
          dayNumber: 1,
          label: "Lower (Quad Focus)",
          weekNumber: 1,
          completedAt: sessionTime,
          durationSeconds: 2860,
          volumeKg: 3450,
          setsDone: 12,
          setsTotal: 14,
          note: "Good baseline session. Right knee felt tender on the final squat set.",
          rewardPoints: 25,
          proof: {
            required: true,
            status: "awaiting-review",
            storagePath: null,
            isSamplePlaceholder: true,
          },
          isSample: true,
          createdAt: sessionTime,
        })
      }

      if (!checkInSnapshot.exists) {
        transaction.create(checkInReference, {
          id: checkInReference.id,
          weekNumber: 1,
          submittedAt: checkInTime,
          workoutsDone: 3,
          nutritionPct: 82,
          energy: 3,
          trainingFeel: "just-right",
          pain: "Right knee felt tender after squats, but settled after the session.",
          note: "Energy improved through the week. Would like a squat-form check.",
          rewardPoints: 20,
          reviewStatus: "needs-attention",
          reviewedAt: null,
          reviewedByUid: null,
          isSample: true,
          createdAt: checkInTime,
        })
      }

      if (!eventSnapshot.exists) {
        transaction.create(eventReference, {
          memberId,
          type: "member.joined",
          fromStatus: null,
          toStatus: "active",
          reason: "Development sample data",
          createdAt: FieldValue.serverTimestamp(),
          createdByUid: "system:sample-seed",
          createdByEmail: "system:sample-seed",
        })
      }

      const detailWrites =
        Number(!sessionSnapshot.exists) +
        Number(!checkInSnapshot.exists) +
        Number(!eventSnapshot.exists)
      return {
        created: code.status === "unused",
        enriched: true,
        memberId,
        writes: 1 + Number(code.status === "unused") + detailWrites,
      }
    })

    console.log(
      JSON.stringify(
        {
          result: result.enriched
            ? result.created
              ? "seeded-and-enriched"
              : "enriched"
            : "already-enriched",
          memberId: result.memberId,
          displayName: "Ada Nwosu",
          accessCode,
          database: databaseId,
          writes: result.writes,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    fail(error instanceof Error ? error.message : "unknown error.")
  }
}
