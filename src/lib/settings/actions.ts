'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { oauthConfig } from '@/lib/oauth/config';

// Server actions of the "Réglages" window: account info and the OAuth accesses
// granted to Claude (custom connector), with revocation. Owner only.

export interface ClaudeConnection {
  familyId: string;
  clientName: string;
  issuedAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

async function owner() {
  const config = oauthConfig();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { user, store: config && user.id === config.ownerId ? config.store : null };
}

export async function getSettings(): Promise<{ email: string | null; isOwner: boolean; connections: ClaudeConnection[] }> {
  const o = await owner();
  if (!o) return { email: null, isOwner: false, connections: [] };
  if (!o.store) return { email: o.user.email ?? null, isOwner: false, connections: [] };
  const tokens = await o.store.listActive(o.user.id, new Date().toISOString());
  return {
    email: o.user.email ?? null,
    isOwner: true,
    connections: tokens.map((t) => ({
      familyId: t.family_id,
      clientName: t.client_name,
      issuedAt: t.created_at ?? '',
      lastUsedAt: t.last_used_at ?? null,
      expiresAt: t.refresh_expires_at,
    })),
  };
}

export async function revokeConnection(familyId: string): Promise<void> {
  const o = await owner();
  if (!o?.store || !familyId) return;
  const now = new Date().toISOString();
  const active = await o.store.listActive(o.user.id, now);
  if (active.some((t) => t.family_id === familyId)) await o.store.revokeFamily(familyId, now);
}
