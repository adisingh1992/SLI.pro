import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Scroll to the top of the page
 */
export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
