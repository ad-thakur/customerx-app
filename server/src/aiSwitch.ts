// Master switch for every call to the Anthropic API — the consumer-side
// assessment and notice helpers as well as the brand dashboard.
//
// AI is OFF unless AI_ENABLED=true is set explicitly, even when an
// ANTHROPIC_API_KEY is present. With it off, every feature falls back to its
// rules-only path: nothing is sent to Anthropic and nothing is billed to a
// brand's AI allowance. Flip it on once the platform is ready.

export function aiEnabled(): boolean {
  return process.env.AI_ENABLED === 'true' && Boolean(process.env.ANTHROPIC_API_KEY)
}

/** Why AI is off, for logs and the health check. */
export function aiStatus(): 'enabled' | 'switched_off' | 'no_key' {
  if (!process.env.ANTHROPIC_API_KEY) return 'no_key'
  return process.env.AI_ENABLED === 'true' ? 'enabled' : 'switched_off'
}
