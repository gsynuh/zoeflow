import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Merges class names using twMerge for Tailwind CSS class conflict resolution
 */
export function classNames(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
