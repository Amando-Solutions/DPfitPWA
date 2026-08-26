import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * shadcn's class merger. `clsx` flattens the conditional/array/object forms the
 * components accept, then `tailwind-merge` resolves the collisions that come
 * from a caller passing a utility the component already sets: last one wins,
 * per Tailwind's own conflict groups, rather than per stylesheet order.
 *
 * The DP theme publishes its tokens through `@theme inline`, so the utilities
 * that reach here are ordinary Tailwind classes (`bg-raised`, `rounded-card`)
 * and tailwind-merge groups them correctly without extra configuration.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
