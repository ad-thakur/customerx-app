/**
 * One-time move of browser storage from the old product name's keys to the
 * new ones. Anonymous users' cases live only in localStorage, so renaming a
 * key without copying it would make their cases vanish from the dashboard.
 *
 * Imported first in main.tsx, so it runs before anything reads these keys.
 * Safe to run on every load: it only copies when the new key is still empty.
 */
const RENAMED: Array<[from: string, to: string]> = [
  ['consumerx.intake.v1', 'allsquare.intake.v1'],
  ['consumerx.session.v1', 'allsquare.session.v1'],
  ['consumerx.brand.v1', 'allsquare.brand.v1'],
  ['consumerx.caseTokens.v1', 'allsquare.caseTokens.v1'],
  ['consumerx.caseSigs.v1', 'allsquare.caseSigs.v1'],
]

try {
  for (const [from, to] of RENAMED) {
    const old = localStorage.getItem(from)
    if (old !== null && localStorage.getItem(to) === null) localStorage.setItem(to, old)
    // The old key is left in place: harmless, and a safety net if this
    // version is ever rolled back.
  }
} catch {
  // Storage unavailable (private mode, blocked cookies): nothing to move.
}
