import { Timestamp } from 'firebase/firestore'
import type { Message } from './types'

// Seed conversation, as `cohorts/{cohortId}/threads/{threadId}/messages`
// documents. Anything the member sends is stored separately and appended at
// read time. See `lib/datasource/local.ts`.
//
// Two fields that were here are gone, both because they describe the *reader*
// rather than the message: `isSelf` is true of whoever is looking, and
// `reactions` folds the viewer's own taps into everyone else's counts. Both now
// live on `ChatMessageView`. What is stored is `reactionCounts`, a map so that
// two members reacting at the same instant are two atomic `increment(1)` writes
// to different fields instead of one overwriting the other.

const at = (iso: string) => Timestamp.fromDate(new Date(iso))

export const cohortSeed: Message[] = [
  {
    id: 'm1',
    authorUid: 'coach-dp',
    authorName: 'Coach Dayo',
    authorAvatarUrl:
      'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=100&q=80',
    isCoach: true,
    text: 'Welcome in 💗 Week 1 is Foundation week, so dial in your form and find your baseline loads. Proof photo after every session, please.',
    sentAt: at('2026-08-18T07:30:00Z'),
    attachments: [],
    reactionCounts: { '🔥': 12, '💪': 8 },
  },
  {
    id: 'm2',
    authorUid: 'member-tomi',
    authorName: 'Tomi',
    authorAvatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80',
    isCoach: false,
    text: 'Just hit a PR on incline press 🙌 those tempo cues really help',
    sentAt: at('2026-08-18T08:05:00Z'),
    attachments: [],
    reactionCounts: { '👏': 5 },
  },
  {
    id: 'm3',
    authorUid: 'member-lola',
    authorName: 'Lola',
    authorAvatarUrl:
      'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=100&q=80',
    isCoach: false,
    text: 'Down 1.4kg this week and feeling strong 😤',
    sentAt: at('2026-08-18T08:32:00Z'),
    attachments: [],
    reactionCounts: { '🔥': 9 },
  },
]

export const coachSeed: Message[] = [
  {
    id: 'dm1',
    authorUid: 'coach-dp',
    authorName: 'Coach Dayo',
    authorAvatarUrl:
      'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=100&q=80',
    isCoach: true,
    text: 'Hey! I’m here for anything: form checks, swaps, or a bad week. Send me a clip whenever you want eyes on a lift 💪',
    sentAt: at('2026-08-17T18:00:00Z'),
    attachments: [],
    reactionCounts: {},
  },
]
