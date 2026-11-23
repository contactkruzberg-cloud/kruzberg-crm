'use client';

import { useAutoMailSync } from '@/hooks/use-emails';

/** Mounted once in the app: keeps the CRM's mail in step with booking@. */
export function MailSync() {
  useAutoMailSync();
  return null;
}
