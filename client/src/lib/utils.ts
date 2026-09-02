import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, letting a later Tailwind utility beat an earlier one in the
 * same group. Every shadcn component composes its variants through this.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
