import type { BadgeDef } from './types'

// =============================================================================
// Badges the app ships, rather than ones a program authors.
//
// The ladder is authored content, read off the program document. Final Photo
// Proof arrived after those documents were written, and a badge that only
// appears once somebody edits every program in the console is a badge members
// do not see. So it is defined once here and added to any ladder that lacks it
// on read (see `normaliseProgram` in `lib/datasource/firestore`). A program that
// lists `final-photo` itself keeps its own copy.
//
// No `~` imports: `data/program.ts` pulls this in, and the seed script runs that
// file under bun, outside Nuxt's aliases.
// =============================================================================

/** The bookend to Photo Proof: a photo taken after the block's last session. */
export const finalPhotoBadge: BadgeDef = {
  id: 'final-photo',
  name: 'Final Photo Proof',
  emoji: '🖼️',
  description: 'Upload your Final Progress',
  tier: 'starter',
}

/** The ladder with Final Photo Proof on the end, unless it already has it. */
export const withShippedBadges = (badges: BadgeDef[]): BadgeDef[] =>
  badges.some((b) => b.id === finalPhotoBadge.id) ? badges : [...badges, finalPhotoBadge]
