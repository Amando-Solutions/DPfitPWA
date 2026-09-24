import { readPrice, type Price } from '~/data/landing'

/** The configured price — see `readPrice` for where it comes from. */
export const usePrice = (): Price => readPrice(useRuntimeConfig().public)
