'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, ClipboardCopy, Filter, Mail, MoreHorizontal, Plus, Radar, Search, Settings2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useRadar } from '@/hooks/use-radar';
import { usePersistentState } from '@/lib/persistent-state';
import { cn } from '@/lib/utils';
import {
  addrUsers,
  ADV,
  baseSet,
  buildIndex,
  CATL,
  chance,
  daysTo,
  DEFAULT_FILTERS,
  dupsOf,
  expired,
  filterLeads,
  fmtDate,
  hasDraft,
  inCrm,
  isKnown,
  isNew,
  keyDate,
  live,
  needsCrm,
  STAGE_LABEL,
  STATUS_TO_STAGE,
  STATUSES,
  TABS,
  todoOf,
  today,
  triQueue,
  type RadarFilters,
  type TabId,
  isClosed,
} from '@/lib/radar/logic';
import { buildMail, emailsOf, kindOf, langOf } from '@/lib/radar/mail-templates';
import type { Lead } from '@/lib/radar/types';
import { LeadPanel } from './lead-panel';
import { TriageDialog } from './triage-dialog';
import { VeilleDialog } from './veille-dialog';
import { ChanceBadge, Kbd, Tag } from './radar-ui';
import { NAV_ITEMS, RadarNav, RadarNavMobile } from './radar-nav';
import { useRadarActions } from './use-radar-actions';

const PAGE = 80;

const BULK_ACTIONS: [string, string][] = [
  ['contacted_mail', 'Contacté par mail aujourd’hui → pipeline'],
  ['contacted_form', 'Contacté par formulaire aujourd’hui → pipeline'],
  ['contacted_dm', 'Contacté par DM / téléphone aujourd’hui → pipeline'],
  ['draft_auto', 'Brouillons en file pour Claude (modèle auto, pistes avec email)'],
  ['st:à contacter', 'Marquer « à contacter » (reste dans le radar)'],
  ['crm', 'Envoyer au pipeline (quittent le radar)'],
  ['st:refusé', 'Refusé → pipeline'],
  ['dismiss', 'Écarter (pas intéressé)'],
  ['restore', 'Restaurer (archives)'],
];

// ---------------------------------------------------------------- list row

function LeadRow({
  lead,
  tab,
  meta,
  idx,
  picked,
  focused,
  onPick,
  onOpen,
  onCompose,
}: {
  lead: Lead;
  tab: TabId;
  meta: ReturnType<typeof useRadar>['meta'];
  idx: ReturnType<typeof buildIndex>;
  picked: boolean;
  focused: boolean;
  onPick: (on: boolean) => void;
  onOpen: () => void;
  onCompose: () => void;
}) {
  const actions = useRadarActions();
  const k = keyDate(lead);
  const C = inCrm(lead);
  const st = lead.status || 'nouveau';
  const td = tab === 'todo' ? todoOf(lead, meta) : null;
  const dups = live(lead) ? dupsOf(idx, lead) : [];
  const used = live(lead) && !hasDraft(lead) ? addrUsers(idx, emailsOf(lead.email), lead.id) : [];
  const loc = [lead.venue, lead.city, lead.country && lead.country !== 'FR' ? lead.country : null].filter(Boolean).join(' · ');
  const tierBorder = { hi: 'border-l-green-500', mid: 'border-l-primary', lo: 'border-l-orange-500', vlo: 'border-l-border' }[
    chance(lead).sc >= 75 ? 'hi' : chance(lead).sc >= 58 ? 'mid' : chance(lead).sc >= 40 ? 'lo' : 'vlo'
  ];

  return (
    <div
      id={`lead-${lead.id}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cn(
        'group flex gap-3 rounded-lg border border-l-4 bg-card p-3 transition-all hover:shadow-md hover:border-primary/30 cursor-pointer outline-none',
        tierBorder,
        picked && 'ring-2 ring-primary/50',
        focused && 'ring-2 ring-primary',
        isNew(lead, meta) && live(lead) && 'bg-primary/[0.03]',
      )}
    >
      <input
        type="checkbox"
        checked={picked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onPick(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        aria-label={`Sélectionner ${lead.name}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium">{lead.name}</span>
          {loc && <span className="truncate text-xs text-muted-foreground">{loc}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {isNew(lead, meta) && live(lead) && <Tag tone="new">nouveau</Tag>}
          {['all', 'trash', 'drafts', 'todo', 'crm', 'known'].includes(tab) && <Tag>{CATL[lead.cat] || lead.cat}</Tag>}
          {lead.type && <Tag>{lead.type}</Tag>}
          {k && (
            <Tag tone={k.n < 0 ? 'muted' : k.n <= 14 ? 'urgent' : 'warn'}>
              {k.kind} {fmtDate(k.d)}
              {k.n >= 0 ? ` · J-${k.n}` : ''}
            </Tag>
          )}
          {C ? <Tag tone="crm">Pipeline · {STAGE_LABEL[lead.crmStage || ''] || lead.crmStage || '—'}</Tag> : st !== 'nouveau' && <Tag tone={ADV.includes(st) ? 'crm' : 'default'}>{st}</Tag>}
          {needsCrm(lead) && <Tag tone="urgent">pas encore au pipeline</Tag>}
          {!C && lead.draftState === 'pending' && <Tag tone="warn">brouillon en file</Tag>}
          {!C && lead.draftState !== 'pending' && lead.draftAt && <Tag tone="ok">brouillon {fmtDate(lead.draftAt)}</Tag>}
          {!C && (lead.email ? <Tag>✉</Tag> : lead.contactForm ? <Tag>formulaire</Tag> : null)}
          {expired(lead) && !lead.dismissed && !C && <Tag tone="muted">périmée</Tag>}
          {isClosed(lead) && !lead.dismissed && !C && <Tag tone="muted">fermée · ne pas démarcher</Tag>}
          {lead.dismissed && <Tag tone="muted">écartée{lead.dismissReason ? ` · ${lead.dismissReason}` : ''}</Tag>}
          {dups.length > 0 && <Tag tone="warn">doublon ? {dups[0].name}</Tag>}
          {used.length > 0 && <Tag tone="warn">adresse déjà sollicitée</Tag>}
          {isKnown(lead) && <Tag tone="warn">{lead._known!.source === 'sent' ? 'déjà écrit depuis booking@' : 'déjà dans le CRM'}</Tag>}
        </div>
        {isKnown(lead) && <p className="mt-2 border-l-2 border-orange-500 pl-2 text-xs text-muted-foreground">{lead._known!.why}</p>}
        {td && (
          <div className="mt-2 space-y-0.5">
            {td.why.map((w) => (
              <p key={w.t} className={cn('border-l-2 pl-2 text-xs', w.soft ? 'border-primary text-muted-foreground' : 'border-red-500 text-foreground')}>
                {w.t}
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <ChanceBadge lead={lead} />
        {live(lead) && (
          <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onCompose();
              }}
            >
              <Mail className="h-3 w-3" /> Email
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              disabled={actions.busy}
              onClick={(e) => {
                e.stopPropagation();
                void actions.sendToPipeline(lead);
              }}
            >
              <Plus className="h-3 w-3" /> Pipeline
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- view

export function RadarView() {
  const { leads, meta, scope, learned, runs, outbox, isLoading, error, known, knownError } = useRadar();
  const actions = useRadarActions();
  const [tab, setTab] = usePersistentState<TabId>('radar:tab', 'todo');
  const [filters, setFilters] = usePersistentState<RadarFilters>('radar:filters', DEFAULT_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [composeId, setComposeId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('contacted_mail');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [triageOpen, setTriageOpen] = useState(false);
  const [veilleOpen, setVeilleOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const idx = useMemo(() => buildIndex(leads), [leads]);
  const list = useMemo(() => filterLeads(leads, tab, filters, meta, idx), [leads, tab, filters, meta, idx]);
  const visible = list.slice(0, limit);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, baseSet(leads, t.id, meta)])), [leads, meta]);
  const tabCounts = useMemo(() => Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.length])), [counts]);
  const freshCounts = useMemo(
    () => Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, ['trash', 'drafts', 'crm', 'known', 'todo'].includes(k) ? 0 : v.filter((l) => isNew(l, meta)).length])),
    [counts, meta],
  );
  const currentNav = NAV_ITEMS.find((n) => n.id === tab);
  const selectTab = (id: TabId) => {
    setTab(id);
    setLimit(PAGE);
    setFocusIdx(-1);
  };
  const toCrm = leads.filter(needsCrm);
  const triCount = triQueue(leads, meta, new Set()).length;
  const strip = leads
    .filter((l) => live(l) && !ADV.includes(l.status || '') && chance(l).sc >= 40)
    .map((l) => ({ l, k: keyDate(l) }))
    .filter((x) => x.k && x.k.n >= 0 && x.k.n <= 60)
    .sort((a, b) => a.k!.n - b.k!.n);
  const cities = [...idx.city.entries()].sort((a, b) => b[1].items.length - a[1].items.length || a[1].label.localeCompare(b[1].label));
  const openLead = leads.find((l) => l.id === openId) || null;
  const setF = (patch: Partial<RadarFilters>) => {
    setFilters({ ...filters, ...patch });
    setLimit(PAGE);
  };
  const activeFilters = [filters.zone, filters.city, filters.minChance, filters.status, filters.onlyNew, filters.withEmail, filters.fresh].filter(Boolean).length;
  const veilleAge = meta.date ? -(daysTo(meta.date) || 0) : null;

  const jump = useCallback(
    (id: string) => {
      const l = leads.find((x) => x.id === id);
      if (!l) return;
      setTab(inCrm(l) ? 'crm' : isKnown(l) ? 'known' : !live(l) ? 'trash' : l.cat);
      setFilters(DEFAULT_FILTERS);
      setOpenId(id);
    },
    [leads, setTab, setFilters],
  );

  // ---- keyboard shortcuts (same as the artifact)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (triageOpen || veilleOpen || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      const cur = visible[focusIdx];
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIdx((i) => Math.min(visible.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if ((e.key === 'Enter' || e.key === 'o') && cur && !openId) {
        setOpenId(cur.id);
      } else if (e.key === 'e' && cur && live(cur)) {
        setComposeId(cur.id);
        setOpenId(cur.id);
      } else if (e.key === 'p' && cur && live(cur)) {
        void actions.sendToPipeline(cur);
      } else if (e.key === 'x' && cur && live(cur)) {
        void actions.dismiss(cur, 'Non précisé');
      } else if (e.key === 't') {
        setTriageOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, focusIdx, openId, triageOpen, veilleOpen, actions]);

  useEffect(() => {
    const cur = visible[focusIdx];
    if (cur) document.getElementById(`lead-${cur.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusIdx, visible]);

  // ---- bulk
  const runBulk = async () => {
    const items = [...picked].map((id) => leads.find((l) => l.id === id)).filter(Boolean) as Lead[];
    if (!items.length) return;
    setBulkRunning(true);
    let ok = 0;
    let crmOk = 0;
    const errs: string[] = [];
    const skipped: string[] = [];
    const d = today();
    const dFR = new Date().toLocaleDateString('fr-FR');
    const channel = ({ contacted_mail: 'email', contacted_form: 'formulaire', contacted_dm: 'DM / téléphone' } as Record<string, string>)[bulkAction];
    const batchAddr = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      const l = items[i];
      setBulkMsg(`${i + 1}/${items.length} · ${l.name}`);
      try {
        if (bulkAction === 'draft_auto') {
          const to = emailsOf(l.email);
          if (!to.length) skipped.push(`${l.name} (pas d'email)`);
          else if (hasDraft(l) || inCrm(l)) skipped.push(`${l.name} (déjà traité)`);
          else if (addrUsers(idx, to, l.id).length || to.some((a) => batchAddr.has(a))) skipped.push(`${l.name} (adresse déjà sollicitée)`);
          else {
            const m = buildMail(l, kindOf(l), langOf(l));
            await actions.queueDraft(l, to, m.subject, m.body);
            to.forEach((a) => batchAddr.add(a));
            ok++;
          }
          continue;
        }
        if (bulkAction === 'st:à contacter') {
          await actions.patch(l.id, { status: 'à contacter', statusAt: d });
          ok++;
          continue;
        }
        if (bulkAction === 'dismiss') {
          await actions.patch(l.id, { dismissed: true, dismissReason: 'Pas intéressé (lot)', dismissedAt: d });
          ok++;
          continue;
        }
        if (bulkAction === 'restore') {
          await actions.patch(l.id, { dismissed: false, dismissReason: '', dismissedAt: '' });
          ok++;
          continue;
        }
        if (bulkAction === 'crm') {
          const er = await actions.toPipeline(l, STATUS_TO_STAGE[l.status || ''] || 'a_contacter', 'Radar : synchronisation groupée', l.status || 'nouveau');
          if (er) errs.push(`${l.name} : ${er}`);
          else {
            ok++;
            crmOk++;
          }
          continue;
        }
        const status = channel ? 'contacté' : bulkAction.slice(3);
        const note = channel ? `Contacté par ${channel} le ${dFR} (radar)` : `Radar : statut → ${status} le ${dFR}`;
        await actions.patch(l.id, { status, statusAt: d, ...(channel ? { contactChannel: channel, contactedAt: d } : {}) });
        ok++;
        const er = await actions.toPipeline({ ...l, status }, STATUS_TO_STAGE[status], note, status);
        if (er) errs.push(`${l.name} (pipeline) : ${er}`);
        else crmOk++;
      } catch (err) {
        errs.push(`${l.name} : ${err instanceof Error ? err.message : 'erreur'}`);
      }
    }
    setBulkRunning(false);
    const crmish = !['dismiss', 'restore', 'draft_auto', 'st:à contacter'].includes(bulkAction);
    const msg = `${ok}/${items.length} ${bulkAction === 'draft_auto' ? 'mis en file (dis à Claude « crée les brouillons en attente »)' : 'mis à jour'}${crmish ? ` · ${crmOk} au pipeline` : ''}${skipped.length ? ` · ignorés : ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}` : ''}${errs.length ? ` · ${errs.length} erreur(s) : ${errs.slice(0, 2).join(' | ')}` : ''}`;
    setBulkMsg(msg);
    if (errs.length) toast.error(msg);
    else {
      toast.success(msg);
      setPicked(new Set());
      setBulkMsg('');
    }
  };

  const sendAllToCrm = async () => {
    let ok = 0;
    for (const l of toCrm) {
      const ch = l.contactChannel;
      const dFR = l.contactedAt ? new Date(l.contactedAt).toLocaleDateString('fr-FR') : null;
      const er = await actions.toPipeline(l, STATUS_TO_STAGE[l.status || ''], ch && dFR ? `Contacté par ${ch} le ${dFR} (radar)` : `Radar : statut ${l.status}`, l.status);
      if (!er) ok++;
    }
    toast.success(`${ok} piste${ok > 1 ? 's' : ''} passée${ok > 1 ? 's' : ''} au pipeline`);
  };

  const copyView = async () => {
    const cl = (v: unknown) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
    const head = ['Nom', 'Rubrique', 'Type', 'Ville', 'Pays', 'Jauge', 'Date clé', 'Email prog', 'Formulaire', 'Contact', 'Statut', 'Chances', 'Lien'];
    const rows = list.map((l) => {
      const k = keyDate(l);
      return [l.name, CATL[l.cat] || l.cat, l.type, l.city, l.country || 'FR', l.capacity, k ? `${k.kind} ${k.d}` : '', l.email, l.contactForm?.url, l.contact, inCrm(l) ? `Pipeline · ${STAGE_LABEL[l.crmStage || ''] || ''}` : l.status || 'nouveau', chance(l).sc, l.links?.[0]?.url]
        .map(cl)
        .join('\t');
    });
    try {
      await navigator.clipboard.writeText([head.join('\t'), ...rows].join('\n'));
      toast.success(`${rows.length} lignes copiées : colle-les dans Numbers, Excel ou Sheets`);
    } catch {
      toast.error('Copie impossible');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">Impossible de charger le radar : {String((error as Error).message)}</p>;

  return (
    <div className={cn('space-y-5', picked.size > 0 && 'pb-24')}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="hidden md:flex items-center gap-2 text-xl font-bold">
            <Radar className="h-5 w-5 text-primary" /> Booking Radar
          </h1>
          <p className="text-sm text-muted-foreground">
            {meta.date ? (
              <>
                Dernière veille : <span className="text-foreground">{fmtDate(meta.date)}</span>
                {meta.added != null && ` · ${meta.added} ajout${meta.added > 1 ? 's' : ''}`}
                {veilleAge != null && veilleAge >= 2 && <span className="text-red-500"> · aucune veille depuis {veilleAge} j</span>}
              </>
            ) : (
              'Aucune veille encore enregistrée.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setTriageOpen(true)} disabled={!triCount} className="gap-1.5">
            <Sparkles className="h-4 w-4" /> {triCount ? `Trier les nouvelles (${triCount})` : 'Rien à trier'}
          </Button>
          <Button variant="outline" onClick={() => setVeilleOpen(true)} className="gap-1.5">
            <Settings2 className="h-4 w-4" /> Veille
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title="Plus">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyView} className="gap-2">
                <ClipboardCopy className="h-4 w-4" /> Copier la vue (tableur)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => {
                  const ids = leads.filter((l) => !inCrm(l) && !l.dismissed && l.draftState === 'created' && !ADV.includes(l.status || '')).map((l) => l.id);
                  setPicked(new Set(ids));
                  setBulkAction('contacted_mail');
                  setTab('drafts');
                  toast.info(`${ids.length} brouillons sélectionnés : applique « Contacté par mail » à ceux réellement envoyés.`);
                }}
              >
                <Mail className="h-4 w-4" /> Sélectionner les brouillons créés
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {meta.summary && <p className="-mt-3 text-xs text-muted-foreground line-clamp-2">{meta.summary}</p>}

      <RadarNavMobile tab={tab} counts={tabCounts} fresh={freshCounts} onSelect={selectTab} />
      <div className="lg:flex lg:items-start lg:gap-6">
        <RadarNav tab={tab} counts={tabCounts} fresh={freshCounts} onSelect={selectTab} />
        <div className="min-w-0 flex-1 space-y-5">
          {/* Current view */}
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {currentNav && <currentNav.icon className="h-5 w-5 text-primary" />}
              {currentNav?.label}
              <span className="text-sm font-normal text-muted-foreground">
                {list.length}
                {list.length !== (tabCounts[tab] ?? 0) ? ` / ${tabCounts[tab] ?? 0}` : ''} piste{list.length > 1 ? 's' : ''}
              </span>
            </h2>
            {currentNav && <p className="text-xs text-muted-foreground">{currentNav.hint}</p>}
          </div>

          {/* Banners */}
          {toCrm.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span>
                <b>{toCrm.length}</b> piste{toCrm.length > 1 ? 's' : ''} déjà contactée{toCrm.length > 1 ? 's' : ''} mais absente{toCrm.length > 1 ? 's' : ''} du pipeline (
                {toCrm.slice(0, 3).map((l) => l.name).join(', ')}
                {toCrm.length > 3 ? '…' : ''})
              </span>
              <Button size="sm" className="ml-auto h-7" onClick={sendAllToCrm} disabled={actions.busy}>
                Tout envoyer au pipeline
              </Button>
            </div>
          )}
          {outbox.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <b>{outbox.length}</b> brouillon{outbox.length > 1 ? 's' : ''} en file ({outbox.slice(0, 4).map((o) => o.leadName || o.leadId).join(', ')}
              {outbox.length > 4 ? '…' : ''}). Pour les créer dans Mail, demande à Claude : « crée les brouillons en attente ».
            </div>
          )}

          {/* Upcoming deadlines */}
          {strip.length > 0 && (tab === 'todo' || tab === 'all') && (
            <section className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Échéances · 60 jours</h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {strip.map(({ l, k }) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => jump(l.id)}
                    className={cn('w-52 shrink-0 rounded-lg border bg-card p-2.5 text-left transition-all hover:border-primary/40 hover:shadow-md', k!.n <= 14 && 'border-red-500/40')}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {CATL[l.cat]} · {k!.kind}
                    </div>
                    <div className={cn('mt-0.5 font-mono text-xs', k!.n <= 14 ? 'text-red-500' : 'text-orange-500')}>
                      {fmtDate(k!.d)} · J-{k!.n}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-medium">{l.name}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Anti-duplicate scan status */}
          {['booking_fr', 'booking_eu', 'known'].includes(tab) && (
            <p className={cn('text-xs', known?.sentError || knownError ? 'text-orange-500' : 'text-muted-foreground')}>
              {knownError
                ? `Anti-doublon indisponible : ${knownError instanceof Error ? knownError.message : ''}`
                : !known
                  ? 'Anti-doublon : vérification du pipeline et des mails envoyés…'
                  : `Anti-doublon booking : ${counts.known.length} piste${counts.known.length > 1 ? 's' : ''} masquée${counts.known.length > 1 ? 's' : ''} (déjà dans le CRM ou déjà écrites depuis booking@, ${known.sent.length} adresses scannées)${known.sentError ? ` · mails envoyés non lus : ${known.sentError}` : ''}`}
            </p>
          )}

          {/* Filters */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input ref={searchRef} value={filters.q} onChange={(e) => setF({ q: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setF({ q: '' })} placeholder="Chercher un lieu, une ville, un contact…  ( / )" className="pl-9" />
              </div>
              <Select value={filters.sort} onValueChange={(v) => setF({ sort: v as RadarFilters['sort'] })}>
                <SelectTrigger className="w-auto gap-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smart">Tri : priorité</SelectItem>
                  <SelectItem value="chance">Tri : chances</SelectItem>
                  <SelectItem value="deadline">Tri : échéance</SelectItem>
                  <SelectItem value="added">Tri : ajout récent</SelectItem>
                  <SelectItem value="name">Tri : A → Z</SelectItem>
                </SelectContent>
              </Select>
              <Button variant={showFilters || activeFilters ? 'secondary' : 'outline'} className="gap-1.5" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="h-4 w-4" /> Filtres{activeFilters ? ` (${activeFilters})` : ''}
              </Button>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={list.length > 0 && list.every((l) => picked.has(l.id))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(list.map((l) => l.id)) : new Set())}
                />
                Tout sélectionner
              </label>
            </div>
            {showFilters && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
                <Select value={filters.zone || 'all'} onValueChange={(v) => setF({ zone: v === 'all' ? '' : (v as RadarFilters['zone']) })}>
                  <SelectTrigger className="h-8 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes zones</SelectItem>
                    <SelectItem value="Lyon / AURA">Lyon / AURA</SelectItem>
                    <SelectItem value="France">France</SelectItem>
                    <SelectItem value="Europe">Europe</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.city || 'all'} onValueChange={(v) => setF({ city: v === 'all' ? '' : v })}>
                  <SelectTrigger className="h-8 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes villes</SelectItem>
                    {cities.map(([key, v]) => (
                      <SelectItem key={key} value={key}>
                        {v.label} ({v.items.length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(filters.minChance)} onValueChange={(v) => setF({ minChance: Number(v) })}>
                  <SelectTrigger className="h-8 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Toutes chances</SelectItem>
                    <SelectItem value="58">Réelles et fortes</SelectItem>
                    <SelectItem value="75">Fortes seulement</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.status || 'all'} onValueChange={(v) => setF({ status: v === 'all' ? '' : v })}>
                  <SelectTrigger className="h-8 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous statuts</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(
                  [
                    ['onlyNew', 'Nouveautés'],
                    ['withEmail', 'Avec email'],
                    ['fresh', 'Adresses pas encore sollicitées'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setF({ [key]: !filters[key] })}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                      filters[key] ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    {label}
                  </button>
                ))}
                {activeFilters > 0 && (
                  <button type="button" onClick={() => setFilters({ ...DEFAULT_FILTERS, q: filters.q, sort: filters.sort })} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" /> Effacer
                  </button>
                )}
              </div>
            )}
            <p className="hidden lg:block text-[11px] text-muted-foreground">
              Raccourcis : <Kbd>/</Kbd> chercher · <Kbd>j</Kbd>
              <Kbd>k</Kbd> naviguer · <Kbd>↵</Kbd> ouvrir · <Kbd>e</Kbd> email · <Kbd>p</Kbd> pipeline · <Kbd>x</Kbd> écarter · <Kbd>t</Kbd> trier
            </p>
          </div>

          {/* List */}
          {list.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              {leads.length ? 'Aucune piste ne correspond aux filtres.' : 'Aucune piste pour l’instant.'}
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((l, i) => (
                <LeadRow
                  key={l.id}
                  lead={l}
                  tab={tab}
                  meta={meta}
                  idx={idx}
                  picked={picked.has(l.id)}
                  focused={i === focusIdx}
                  onPick={(on) => {
                    const s = new Set(picked);
                    if (on) s.add(l.id);
                    else s.delete(l.id);
                    setPicked(s);
                  }}
                  onOpen={() => {
                    setFocusIdx(i);
                    setComposeId(null);
                    setOpenId(l.id);
                  }}
                  onCompose={() => {
                    setFocusIdx(i);
                    setComposeId(l.id);
                    setOpenId(l.id);
                  }}
                />
              ))}
              {list.length > visible.length && (
                <Button variant="ghost" className="w-full" onClick={() => setLimit(limit + PAGE)}>
                  Afficher {Math.min(PAGE, list.length - visible.length)} de plus ({list.length - visible.length} restantes)
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bulk bar */}
      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:left-16">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2 p-3">
            <span className="text-sm font-medium">
              {picked.size} sélectionnée{picked.size > 1 ? 's' : ''}
            </span>
            <Select value={bulkAction} onValueChange={setBulkAction} disabled={bulkRunning}>
              <SelectTrigger className="h-9 w-auto max-w-[min(90vw,380px)] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BULK_ACTIONS.map(([v, t]) => (
                  <SelectItem key={v} value={v}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={runBulk} disabled={bulkRunning}>
              {bulkRunning ? 'En cours…' : 'Appliquer'}
            </Button>
            <Button variant="ghost" onClick={() => setPicked(new Set())} disabled={bulkRunning}>
              Désélectionner
            </Button>
            {bulkMsg && <span className="w-full text-center text-xs text-muted-foreground">{bulkMsg}</span>}
          </div>
        </div>
      )}

      <AnimatePresence>
        {openLead && (
          <LeadPanel
            key="panel"
            lead={openLead}
            idx={idx}
            composeOnOpen={composeId === openLead.id}
            onClose={() => {
              setOpenId(null);
              setComposeId(null);
            }}
            onJump={jump}
          />
        )}
      </AnimatePresence>

      <TriageDialog
        open={triageOpen}
        onOpenChange={setTriageOpen}
        leads={leads}
        meta={meta}
        idx={idx}
        onCompose={(id) => {
          setComposeId(id);
          setOpenId(id);
        }}
      />
      <VeilleDialog open={veilleOpen} onOpenChange={setVeilleOpen} scope={scope} learned={learned} runs={runs} leads={leads} idx={idx} />
    </div>
  );
}
