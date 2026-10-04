import type { Lead } from './types';

export type MailKind = 'festival' | 'tremplin' | 'venue' | 'support' | 'booker' | 'label' | 'promoteur' | 'presse' | 'radio';
export type MailLang = 'fr' | 'en';
export const K: Record<string, string>;
export const KINDS: Record<MailKind, string>;
export function langOf(l: Lead): MailLang;
export function kindOf(l: Lead): MailKind;
export function emailsOf(s: unknown): string[];
export function buildMail(l: Lead, kind: MailKind, lang: MailLang): { subject: string; body: string };
export function mailtoOf(d: { to: string; subject: string; body: string }): string;
export function fmtD(d: string | null | undefined): string;
