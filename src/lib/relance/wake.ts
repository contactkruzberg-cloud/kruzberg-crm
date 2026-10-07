// Wakes the Claude routine that writes the queued follow-ups (API trigger of
// the routine, on Greg's Claude subscription), so a request is handled within
// minutes instead of waiting for the hourly run.
// Env: RELANCE_ROUTINE_ID (trig_…), RELANCE_ROUTINE_TOKEN (token of its API trigger, Sensitive).
export async function wakeRelanceWorker(): Promise<boolean> {
  const id = process.env.RELANCE_ROUTINE_ID;
  const token = process.env.RELANCE_ROUTINE_TOKEN;
  if (!id || !token) return false;
  const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${encodeURIComponent(id)}/fire`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text: 'Nouvelle demande de relance en file.' }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) console.error('relance worker fire failed', res.status, (await res.text().catch(() => '')).slice(0, 300));
  return res.ok;
}
