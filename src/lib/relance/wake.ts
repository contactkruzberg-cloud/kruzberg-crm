// Wakes a Claude routine through its API trigger (on Greg's Claude
// subscription). The routines have no schedule: they only run when the CRM
// fires them, so nothing is consumed between two clicks.
// Env per routine: <NAME>_ROUTINE_ID (trig_…) and <NAME>_ROUTINE_TOKEN (token
// of its API trigger, Sensitive).

export interface FireResult {
  ok: boolean;
  /** claude.ai link of the run, to follow it live. */
  sessionUrl?: string;
  status?: number;
}

export async function fireRoutine(id: string | undefined, token: string | undefined, text: string): Promise<FireResult> {
  if (!id || !token) return { ok: false };
  const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${encodeURIComponent(id)}/fire`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error('routine fire failed', id, res.status, (await res.text().catch(() => '')).slice(0, 300));
    return { ok: false, status: res.status };
  }
  const body = (await res.json().catch(() => null)) as { claude_code_session_url?: string } | null;
  return { ok: true, sessionUrl: body?.claude_code_session_url, status: res.status };
}

/** Routine that writes the queued follow-ups ("Relancer"). */
export async function wakeRelanceWorker(): Promise<boolean> {
  const r = await fireRoutine(process.env.RELANCE_ROUTINE_ID, process.env.RELANCE_ROUTINE_TOKEN, 'Nouvelle demande de relance en file.');
  return r.ok;
}

/** Booking search ("Lancer une recherche" on the radar page); its scope is read from config/launch. */
export function fireVeille(scopeLabel: string): Promise<FireResult> {
  return fireRoutine(process.env.VEILLE_ROUTINE_ID, process.env.VEILLE_ROUTINE_TOKEN, `Recherche lancée depuis le CRM : ${scopeLabel}.`);
}

/** Constellation: a routine run takes the queued searches one by one through the connector. */
export function fireConstellation(queued: number): Promise<FireResult> {
  return fireRoutine(
    process.env.CONSTELLATION_ROUTINE_ID,
    process.env.CONSTELLATION_ROUTINE_TOKEN,
    `Constellation : ${queued} recherche${queued > 1 ? 's' : ''} en file.`,
  );
}
