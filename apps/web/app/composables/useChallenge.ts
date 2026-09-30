import type { Challenge } from '~/data/challenge'

/** Shared by all landing sections; populated and refreshed by the page. */
export const useChallenge = () => useState<Challenge | null>('active-challenge', () => null)
