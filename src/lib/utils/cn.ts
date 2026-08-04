/**
 * Tiny class-name joiner. Deliberately dependency-free — we control the class
 * ordering in our own components, so full `tailwind-merge` conflict resolution
 * isn't needed. Falsy values are dropped.
 */
export type ClassValue = string | number | null | undefined | false | ClassValue[]

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = []

  const walk = (value: ClassValue): void => {
    if (!value && value !== 0) return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    out.push(String(value))
  }

  inputs.forEach(walk)
  return out.join(' ')
}
