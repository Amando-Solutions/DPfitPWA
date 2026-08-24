import type { ChatMessage } from './types'

// Seed conversation. Anything the member sends is stored separately and appended
// at read time. See `lib/datasource/local.ts`.

export const cohortSeed: ChatMessage[] = [
  {
    id: 'm1',
    authorId: 'coach-dp',
    authorName: 'Coach Dayo',
    authorAvatar:
      'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=100&q=80',
    isCoach: true,
    isSelf: false,
    text: 'Welcome in 💗 Week 1 is Foundation week, so dial in your form and find your baseline loads. Proof photo after every session, please.',
    sentAt: '2026-08-18T07:30:00Z',
    reactions: [
      { emoji: '🔥', count: 12 },
      { emoji: '💪', count: 8 },
    ],
  },
  {
    id: 'm2',
    authorId: 'member-tomi',
    authorName: 'Tomi',
    authorAvatar:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80',
    isCoach: false,
    isSelf: false,
    text: 'Just hit a PR on incline press 🙌 those tempo cues really help',
    sentAt: '2026-08-18T08:05:00Z',
    reactions: [{ emoji: '👏', count: 5 }],
  },
  {
    id: 'm3',
    authorId: 'member-lola',
    authorName: 'Lola',
    authorAvatar:
      'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=100&q=80',
    isCoach: false,
    isSelf: false,
    text: 'Down 1.4kg this week and feeling strong 😤',
    sentAt: '2026-08-18T08:32:00Z',
    reactions: [{ emoji: '🔥', count: 9 }],
  },
]

export const coachSeed: ChatMessage[] = [
  {
    id: 'dm1',
    authorId: 'coach-dp',
    authorName: 'Coach Dayo',
    authorAvatar:
      'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=100&q=80',
    isCoach: true,
    isSelf: false,
    text: 'Hey! I’m here for anything: form checks, swaps, or a bad week. Send me a clip whenever you want eyes on a lift 💪',
    sentAt: '2026-08-17T18:00:00Z',
  },
]
