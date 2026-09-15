# Notifications: what the admin console needs to do

The member app (`apps/pwa`) has an in-app inbox behind a bell icon. This
document covers the parts of it that depend on the admin console. There are
three pieces of work:

1. [Create a notification whenever an announcement is posted](#1-create-a-notification-when-posting-an-announcement)
2. [Set `addressedUids` on every chat message the coach sends](#2-set-addresseduids-on-coach-chat-messages)
3. [Merge the rules and index changes before deploying](#3-rules-and-index-coordinate-before-deploying)

A [checklist](#checklist) at the end summarises all three.

---

## How members receive notifications

The member app watches two things live, for as long as the app is open:

| Source | What shows up in the inbox |
|---|---|
| `cohorts/{cohortId}/notifications` | Every document, as written by the console. |
| `cohorts/{cohortId}/threads/cohort/messages` | Messages whose `addressedUids` contains the member: they were @mentioned, or someone replied to them. |

A new document appears in the inbox and lights the bell within a second or two.

- **This is not a phone push notification.** Nothing reaches a member whose app
  is closed. They see the notification the next time they open the app.
- **Read state belongs to the member app.** It lives at
  `members/{uid}/notificationState/{notificationId}`. The console never reads
  or writes it.
- **The app does not turn announcements into notifications.** Posting a card to
  the deck and telling the cohort about it are two separate writes, and the
  console has to make both.

---

## 1. Create a notification when posting an announcement

When the admin posts an announcement, write a notification in the **same
batch**, so members never get one without the other.

### Notification document

Path: `cohorts/{cohortId}/notifications/{autoId}`

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'coach'` \| `'workout'` \| `'reward'` \| `'community'` \| `'checkin'` | yes | Use `'coach'` for announcements. `'coach'` is styled orange; every other type is rose. |
| `title` | string | yes | The short label above the text, e.g. `"New announcement"`. |
| `body` | string | yes | The main line. Use the announcement's headline. Plain text; no markdown. |
| `publishedAt` | **Timestamp** | yes | Use `serverTimestamp()`. See the warnings below. |
| `pinned` | boolean | yes | `false` unless it should stay at the top. **Always set it.** |
| `icon` | string | yes | One of the icon names listed below. |
| `createdAt` | Timestamp | yes | `serverTimestamp()` |
| `createdByUid` | string | yes | The admin's auth uid. |
| `createdByEmail` | string | yes | The admin's email. |

**Icon names the app can draw:** `bell`, `info`, `chat`, `message`, `reply`,
`phone`, `calendar`, `clock`, `star`, `heart`, `trophy`, `flame`, `train`,
`activity`, `trendingUp`, `checkCircle`, `camera`, `image`, `target`, `fuel`,
`guides`, `user`, `lock`. An unknown name falls back to `info`.

### Example

The example uses the modular web SDK. With the Admin SDK the same fields apply,
using `FieldValue.serverTimestamp()` and `db.batch()`.

```ts
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'

async function publishAnnouncement(db, cohortId, admin, card) {
  const now = serverTimestamp()
  const created = { createdAt: now, createdByUid: admin.uid, createdByEmail: admin.email }
  const updated = { updatedAt: now, updatedByUid: admin.uid, updatedByEmail: admin.email }

  const batch = writeBatch(db)

  // The card on the deck.
  batch.set(doc(collection(db, 'cohorts', cohortId, 'announcements')), {
    eyebrow: card.eyebrow,            // e.g. "Live call"
    title: card.title,                // e.g. "Q&A with Coach Dayo · Sat 10am"
    body: card.body,
    cta: card.cta ?? null,            // button label, or null for no button
    ctaUrl: card.ctaUrl ?? null,      // "/train" or "https://…"; ignored when cta is null
    accent: card.accent,              // 'rose' | 'orange' | 'ink'
    publishedAt: now,
    ...created,
    ...updated,
  })

  // The line in every member's inbox.
  batch.set(doc(collection(db, 'cohorts', cohortId, 'notifications')), {
    type: 'coach',
    title: 'New announcement',
    body: card.title,
    icon: 'bell',
    pinned: false,
    publishedAt: now,
    ...created,
  })

  await batch.commit()
}
```

### Things that will silently break it

- **`publishedAt` must be a Firestore Timestamp.** The member app calls
  `.toMillis()` on it to sort and label the inbox. A string or a number throws
  there, and the inbox and bell break for every member of the cohort until the
  document is fixed.
- **`pinned` and `publishedAt` must both be present.** The app's query orders by
  both, and Firestore leaves out any document missing an `orderBy` field. The
  notification is simply never delivered, with no error.
- **Use auto-generated ids, and never start an id with `chat-`.** Read markers
  for mentions and replies are stored as `chat-{messageId}` in the same
  collection, so a colliding id would share their read state.

### Behaviour to expect

- **Order:** pinned notifications first, then newest first.
- **Limit:** only the 50 newest are delivered, and pinned ones count toward the 50.
- **Audience:** a notification reaches every member of the cohort. There is no
  per-member targeting.
- **Not tappable.** Coach notifications don't link anywhere. The inbox has a
  "See the full announcement deck" link underneath the list.
- **Editing does not notify again.** Read state is keyed by document id, so
  changing a notification a member has already read leaves it read. To tell
  people again, create a new document.
- **Deleting removes it from every inbox.**
- **No scheduling.** A `publishedAt` in the future appears immediately, labelled
  "Just now".
- **The deck updates live.** A new announcement appears on the deck without a
  reload; the deck shows the 20 newest by `publishedAt`.

---

## 2. Set `addressedUids` on coach chat messages

Members get a notification when someone @mentions them or replies to one of
their messages in the cohort chat. The app finds those messages with a query on
a field called `addressedUids`. **A coach message without that field notifies
nobody**, even if it mentions someone or replies to them.

### Message document

Path: `cohorts/{cohortId}/threads/cohort/messages/{autoId}`

| Field | Type | Notes |
|---|---|---|
| `authorUid` | string | The coach's auth uid. Under the proposed rules it must equal the signed-in admin's uid. |
| `authorName` | string | |
| `authorAvatarUrl` | string | `''` if none. |
| `isCoach` | boolean | `true` for coach messages. |
| `text` | string | May be `''` for a photos-only message. |
| `sentAt` | Timestamp | `serverTimestamp()` or `Timestamp.now()`. |
| `editedAt` | Timestamp \| null | `null` on send. |
| `attachments` | array | `{ id, kind: 'image' \| 'file', name, bytes, mimeType, storagePath, downloadUrl }` |
| `replyTo` | object \| null | The message being answered. See below. |
| `mentions` | array | `{ uid, name }` for each person @mentioned. See below. |
| **`addressedUids`** | string[] | **New.** Everyone this message is aimed at. See below. |
| `reactionCounts` | map | `{}` on send. Rules reject anything else. |

### Computing `addressedUids`

Take everyone in `mentions`, add the author of the message being replied to,
remove the sender, and list each uid once. This is the same function the
member app uses:

```ts
function addressedUidsOf({ authorUid, mentions, replyTo }) {
  const uids = new Set((mentions ?? []).map((m) => m.uid).filter(Boolean))
  if (replyTo?.authorUid) uids.add(replyTo.authorUid)
  uids.delete(authorUid)
  return [...uids]
}
```

```ts
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'

await addDoc(collection(db, 'cohorts', cohortId, 'threads', 'cohort', 'messages'), {
  authorUid: coach.uid,
  authorName: coach.name,
  authorAvatarUrl: coach.avatarUrl ?? '',
  isCoach: true,
  text,
  sentAt: serverTimestamp(),
  editedAt: null,
  attachments: [],
  replyTo,                                                   // or null
  mentions,                                                  // or []
  addressedUids: addressedUidsOf({ authorUid: coach.uid, mentions, replyTo }),
  reactionCounts: {},
})
```

### `mentions`

- Each entry is `{ uid, name }`, and `name` must match **exactly** what follows
  the `@` in `text`. For `"Great work @Tomi A."` the entry is
  `{ uid: '…', name: 'Tomi A.' }`. The app highlights names by searching the
  text for `@{name}`.
- Take uids and names from the cohort roster at
  `cohorts/{cohortId}/leaderboard/{uid}`: the document id is the member's uid,
  and `name` is their display name.
- List each uid once. Before sending, drop any mention whose `@name` is no
  longer in the text.

### `replyTo`

A snapshot of the message being answered, not just a pointer to it:

```ts
{
  messageId: original.id,
  authorUid: original.authorUid,       // this is who gets notified
  authorName: original.authorName,
  text: excerpt,                        // original.text trimmed; if over 140 chars,
                                        // the first 140 plus "…"
  attachmentKind: original.text.trim() ? null : (original.attachments[0]?.kind ?? null),
}
```

### Editing a coach message

Recompute `addressedUids` whenever `text` or `mentions` changes, and write all
three fields together. A mention removed in an edit then disappears from that
member's inbox, and a mention added in an edit appears.

### Things to know

- **Only the cohort thread notifies.** Messages in a member's private coach
  thread (`threads/{memberUid}/messages`) never reach the inbox. Every message
  there is already for that member, and the chat tab shows a dot for it. Setting
  `addressedUids` there is harmless but does nothing.
- **Keep the coach's uid consistent.** Members pick the coach to @mention from
  `cohorts/{cohortId}.coach.uid`. Replies to the coach use the `authorUid` of the
  coach's messages. Those two should be the same uid.
- **Older messages don't notify.** Anything sent before `addressedUids` existed
  lacks the field and never appears in an inbox. This is intended.

### Optional: a coach inbox in the console

The same field lets the console list messages aimed at the coach. It needs no
new index, since it uses the one in section 3:

```ts
query(
  collection(db, 'cohorts', cohortId, 'threads', 'cohort', 'messages'),
  where('addressedUids', 'array-contains', coachUid),
  orderBy('sentAt', 'desc'),
  limit(50),
)
```

---

## 3. Rules and index: coordinate before deploying

The member app and the console share one rules document per database. Whoever
deploys last replaces the whole thing, so these changes have to be merged, not
redeployed over.

### What changed in `firestore.rules`

In `match /cohorts/{cohortId}/threads/{threadId}/messages/{messageId}`:

- **create:** `addressedUids`, when present, must be a list.
- **update (member edit):** the edit is now allowed to change
  `['text', 'editedAt', 'mentions', 'addressedUids']`, again requiring
  `addressedUids` to be a list when present.

`firestore.staging.rules` has the same change, and the two files are still
byte-for-byte identical.

### `firestore.rules.proposed` is out of date

The merged member-and-admin file in this repo would break the member app if it
were deployed as-is:

1. **It has no `announcements` block.** Rules deny anything not matched, so
   members couldn't read the deck and the console couldn't write to it. It needs
   the equivalent of:

   ```
   match /announcements/{announcementId} {
     allow read: if inCohort(cohortId) || isAdmin();
     allow write: if isAdmin();
   }
   ```

2. **Its messages `update` rule predates message editing.** It allows only
   `reactionCounts`, so every member edit would be refused. Copy the `update`
   rule from `firestore.rules`, which includes the `addressedUids` change above.

### The new index

`firestore.indexes.json` has a new composite index:

| Collection | Fields |
|---|---|
| `messages` (collection scope) | `addressedUids` array-contains, `sentAt` descending |

If the console deploys indexes from its own index file, add this index there.
When deploying indexes, the Firebase CLI offers to delete any index that isn't
in the file being deployed, and removing this one turns off mentions and
replies for every member.

### Deploy order

1. Deploy the merged rules and the index, to both databases (see "Deploying the
   rules" in `FIREBASE.md` for the exact targets).
2. Wait for the index to finish building. The Firestore console shows progress.
3. Release the member app.

In the other order, member message edits are refused until the rules land, and
the inbox shows no mentions until the index is ready.

**Admin claim.** Writing `notifications` and `announcements` requires the
`coach: true` custom claim under the rules currently in `firestore.rules`. The
proposed file also accepts `dpfitAdmin: true`.

**Coach messages under today's rules.** The messages `create` rule in
`firestore.rules` has no coach branch: it requires `isCoach == false`. A console
posting coach messages through the client SDK therefore needs the proposed
file's admin branch deployed. The alternative is to write through the Admin
SDK, which bypasses rules; the fields in section 2 are still required either way.

---

## Checklist

- [ ] Posting an announcement also creates a `notifications` document, in the
      same batch.
- [ ] Each notification has `type`, `title`, `body`, `icon`, `pinned` (always
      set) and `publishedAt` (a Timestamp), plus the `createdAt`,
      `createdByUid` and `createdByEmail` fields.
- [ ] Notification ids are auto-generated and never start with `chat-`.
- [ ] Coach messages in the cohort thread include `addressedUids`, computed
      with `addressedUidsOf`.
- [ ] Coach message edits recompute `addressedUids` alongside `text` and
      `mentions`.
- [ ] `mentions[].name` matches the text after `@` exactly.
- [ ] `cohorts/{cohortId}.coach.uid` matches the `authorUid` on the coach's
      messages.
- [ ] `firestore.rules.proposed` has an `announcements` block and the current
      messages `update` rule before it replaces `firestore.rules`.
- [ ] Coach messages are written either through the Admin SDK or with the
      proposed file's admin branch deployed. Today's rules refuse
      `isCoach: true` from the client SDK.
- [ ] The console's index file includes the `addressedUids` + `sentAt` index.
- [ ] The rules and index are deployed, and the index has finished building,
      before the member app is released.
