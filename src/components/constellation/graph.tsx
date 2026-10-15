'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import { drag } from 'd3-drag';
import { Sparkles } from 'lucide-react';
import type { Pair } from '@/lib/constellation/links';
import { KIND_COLOR, KIND_PLURAL, type EntityKind } from '@/lib/constellation/types';
import { bandEntityKey } from './band-panel';
import { Dot, Empty, cn } from './ui';
import type { State } from './use-constellation';

interface N extends SimulationNodeDatum {
  id: string;
  label: string;
  type: 'band' | 'entity';
  kind?: EntityKind;
  count: number;
  lyon?: boolean;
  r: number;
}
/** kind : lien groupe → acteur ; weight : nombre de groupes (ou d'acteurs) en commun. */
type L = SimulationLinkDatum<N> & { kind?: EntityKind; weight: number; tip?: string };
type Mode = 'bipartite' | 'actors' | 'bands';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'bipartite', label: 'Groupes ↔ acteurs', hint: 'Taille = nombre de groupes chez qui l’acteur revient' },
  { id: 'actors', label: 'Acteurs entre eux', hint: 'Trait = groupes en commun entre deux acteurs (≥ 2), plus épais quand ils sont nombreux' },
  { id: 'bands', label: 'Groupes entre eux', hint: 'Trait = acteurs en commun entre deux groupes (≥ 2) : salles, tourneur, festivals…' },
];

const KINDS: EntityKind[] = ['tourneur', 'label', 'salle', 'festival', 'organisateur', 'tete_affiche', 'plateau', 'media', 'dispositif'];

export function Graph({ data, pairs, onEntity, onBand, selected }: { data: State; pairs: Pair[]; onEntity: (k: string) => void; onBand: (id: string) => void; selected: string | null }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [min, setMin] = useState(2);
  const [mode, setMode] = useState<Mode>('bipartite');
  const [kinds, setKinds] = useState<Set<EntityKind>>(new Set(['tourneur', 'label', 'salle', 'festival', 'organisateur', 'tete_affiche', 'plateau']));

  const { nodes, links } = useMemo(() => {
    const seeds = data.bands.filter((b) => b.status === 'done' || (b.exploredAt && b.status !== 'rejected'));
    const bandName = new Map(data.bands.map((b) => [b.id, b.name]));
    const list = (xs: string[]) => xs.map((id) => bandName.get(id) ?? id).join(', ');
    if (mode === 'actors') {
      const ents = new Map(data.entities.filter((e) => kinds.has(e.kind) && e.bandIds.length >= min).map((e) => [e.key, e]));
      const links: L[] = [];
      const used = new Set<string>();
      for (const p of pairs) {
        if (p.bands.length < 2) break;
        const a = ents.get(p.a);
        const b = ents.get(p.b);
        if (!a || !b) continue;
        links.push({ source: `e:${p.a}`, target: `e:${p.b}`, weight: p.bands.length, tip: `${a.name} ↔ ${b.name} : ${list(p.bands)}` });
        used.add(p.a);
        used.add(p.b);
      }
      const nodes: N[] = [...used].map((k) => {
        const e = ents.get(k)!;
        return { id: `e:${k}`, label: e.name, type: 'entity', kind: e.kind, count: e.bandIds.length, r: 3.5 + 3.2 * Math.sqrt(e.bandIds.length) };
      });
      return { nodes, links };
    }
    if (mode === 'bands') {
      const ok = new Set(seeds.map((b) => b.id));
      const shared = new Map<string, string[]>();
      for (const e of data.entities) {
        if (!kinds.has(e.kind)) continue;
        const ids = e.bandIds.filter((id) => ok.has(id)).sort();
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++) {
            const id = `${ids[i]}|${ids[j]}`;
            (shared.get(id) ?? shared.set(id, []).get(id)!).push(e.name);
          }
      }
      const links: L[] = [];
      const deg = new Map<string, number>();
      for (const [id, names] of shared) {
        if (names.length < Math.max(2, min)) continue;
        const [a, b] = id.split('|');
        links.push({ source: `b:${a}`, target: `b:${b}`, weight: names.length, tip: `${bandName.get(a)} ↔ ${bandName.get(b)} : ${names.join(', ')}` });
        deg.set(a, (deg.get(a) ?? 0) + 1);
        deg.set(b, (deg.get(b) ?? 0) + 1);
      }
      const nodes: N[] = seeds.map((b) => ({ id: `b:${b.id}`, label: b.name, type: 'band', count: deg.get(b.id) ?? 0, lyon: b.scene === 'lyon', r: 9 }));
      return { nodes, links };
    }
    const seedByKey = new Map(seeds.map((b) => [bandEntityKey(b), b.id]));
    const nodes: N[] = seeds.map((b) => ({ id: `b:${b.id}`, label: b.name, type: 'band', count: 0, lyon: b.scene === 'lyon', r: 9 }));
    const links: L[] = [];
    const used = new Set<string>();
    for (const e of data.entities) {
      if (!kinds.has(e.kind) || e.bandIds.length < min) continue;
      const seed = seedByKey.get(e.key);
      const target = seed ? `b:${seed}` : `e:${e.key}`;
      if (!seed) nodes.push({ id: target, label: e.name, type: 'entity', kind: e.kind, count: e.bandIds.length, r: 3.5 + 3.2 * Math.sqrt(e.bandIds.length) });
      for (const id of e.bandIds) {
        if (`b:${id}` === target) continue;
        links.push({ source: `b:${id}`, target, kind: e.kind, weight: 1 });
        used.add(`b:${id}`);
        used.add(target);
      }
    }
    // Un groupe exploré sans aucun lien visible reste affiché (il n'a rien en commun… pour l'instant).
    return { nodes: nodes.filter((n) => n.type === 'band' || used.has(n.id)), links };
  }, [data, min, kinds, mode, pairs]);

  // Les callbacks et les données changent à chaque rafraîchissement : on ne
  // relance la simulation que si la forme du graphe change vraiment.
  const cb = useRef({ onBand, onEntity });
  const sig = useMemo(() => JSON.stringify([nodes.map((n) => [n.id, n.count]), links.map((l) => [l.source, l.target])]), [nodes, links]);
  const latest = useRef({ nodes, links });
  // Avant l'effet qui dessine : il lit toujours les dernières valeurs.
  useLayoutEffect(() => {
    cb.current = { onBand, onEntity };
    latest.current = { nodes, links };
  });

  useEffect(() => {
    const svg = svgRef.current;
    const { nodes, links } = latest.current;
    if (!svg || !nodes.length) return;
    const { width, height } = svg.getBoundingClientRect();
    const root = select(svg);
    root.selectAll('*').remove();
    const g = root.append('g');
    root.call(
      zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', (ev) => g.attr('transform', ev.transform)),
    );
    root.call(zoom<SVGSVGElement, unknown>().transform as never, zoomIdentity.translate(width / 2, height / 2));
    g.attr('transform', `translate(${width / 2},${height / 2})`);

    const ns: N[] = nodes.map((n) => ({ ...n }));
    const ls: L[] = links.map((l) => ({ ...l }));
    const sim = forceSimulation(ns)
      .force('link', forceLink<N, L>(ls).id((d) => d.id).distance((l) => (mode === 'bipartite' ? ((l.target as N).count >= 3 ? 70 : 55) : 110 - Math.min(50, 12 * l.weight))).strength(0.4))
      .force('charge', forceManyBody<N>().strength((d) => (d.type === 'band' ? -260 : -60 - 25 * d.count)))
      .force('collide', forceCollide<N>().radius((d) => d.r + 3))
      .force('x', forceX(0).strength(0.04))
      .force('y', forceY(0).strength(0.05));

    const link = g
      .append('g')
      .selectAll('line')
      .data(ls)
      .join('line')
      .attr('stroke', (d) => (d.kind ? KIND_COLOR[d.kind] : 'hsl(var(--foreground))'))
      .attr('stroke-opacity', 0.28)
      .attr('stroke-width', (d) => Math.min(6, 1 + (d.weight - 1) * 1.2));
    link.filter((d) => !!d.tip).append('title').text((d) => d.tip!);

    const node = g
      .append('g')
      .selectAll<SVGGElement, N>('g')
      .data(ns)
      .join('g')
      .style('cursor', 'pointer')
      .on('click', (_, d) => (d.type === 'band' ? cb.current.onBand(d.id.slice(2)) : cb.current.onEntity(d.id.slice(2))))
      .on('mouseenter', function (_, d) {
        const near = new Set([d.id]);
        for (const l of ls) {
          const s = (l.source as N).id;
          const t = (l.target as N).id;
          if (s === d.id) near.add(t);
          if (t === d.id) near.add(s);
        }
        node.style('opacity', (n) => (near.has(n.id) ? 1 : 0.15));
        link.attr('stroke-opacity', (l) => ((l.source as N).id === d.id || (l.target as N).id === d.id ? 0.9 : 0.04));
        label.style('display', (n) => (near.has(n.id) ? 'block' : 'none'));
      })
      .on('mouseleave', () => {
        node.style('opacity', 1);
        link.attr('stroke-opacity', 0.28);
        label.style('display', (n) => (showLabel(n) ? 'block' : 'none'));
      })
      .call(
        drag<SVGGElement, N>()
          .on('start', (ev, d) => {
            if (!ev.active) sim.alphaTarget(0.25).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (ev, d) => {
            d.fx = ev.x;
            d.fy = ev.y;
          })
          .on('end', (ev, d) => {
            if (!ev.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    node
      .append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => (d.type === 'band' ? 'hsl(var(--background))' : KIND_COLOR[d.kind!]))
      .attr('fill-opacity', (d) => (d.type === 'band' ? 1 : 0.85))
      .attr('stroke', (d) => (d.type === 'band' ? (d.lyon ? 'hsl(var(--primary))' : 'hsl(var(--foreground))') : 'hsl(var(--background))'))
      .attr('stroke-width', (d) => (d.type === 'band' ? 2.5 : 1.5));
    node.append('title').text((d) => (d.type === 'band' ? d.label : `${d.label} · ${KIND_PLURAL[d.kind!]} · ${d.count} groupes`));

    const showLabel = (d: N) => d.type === 'band' || d.count >= Math.max(mode === 'actors' ? 3 : 2, min);
    const label = node
      .append('text')
      .attr('class', (d) => (d.type === 'band' ? 'graph-label strong' : 'graph-label'))
      .attr('x', (d) => d.r + 4)
      .attr('y', 3.5)
      .style('display', (d) => (showLabel(d) ? 'block' : 'none'))
      .text((d) => d.label);

    sim.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as N).x!)
        .attr('y1', (d) => (d.source as N).y!)
        .attr('x2', (d) => (d.target as N).x!)
        .attr('y2', (d) => (d.target as N).y!);
      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });
    return () => {
      sim.stop();
    };
  }, [sig, min, mode]);

  // Surligne le nœud ouvert dans un panneau.
  useEffect(() => {
    if (!svgRef.current) return;
    select(svgRef.current)
      .selectAll<SVGGElement, N>('g > g > g')
      .select('circle')
      .attr('stroke-width', (d) => (d && (d.id === `e:${selected}` || d.id === `b:${selected}`) ? 4 : d?.type === 'band' ? 2.5 : 1.5));
  }, [selected, sig]);

  const explored = data.bands.some((b) => b.exploredAt);
  if (!explored) return <Empty icon={<Sparkles className="size-6" />} title="La carte se dessine quand des groupes sont explorés" />;

  const toggle = (k: EntityKind) => {
    const s = new Set(kinds);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    setKinds(s);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center rounded-md border border-border bg-card p-0.5">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => {
                setMode(m.id);
                if (m.id === 'bands' && min < 2) setMin(2);
              }} className={cn('rounded px-2.5 py-1.5', mode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-md border border-border bg-card p-0.5">
          {(mode === 'bands' ? [2, 3, 4] : [1, 2, 3]).map((n) => (
            <button key={n} onClick={() => setMin(n)} className={cn('rounded px-2.5 py-1.5', min === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {mode === 'bands' ? `≥ ${n} acteurs en commun` : n === 1 ? 'Tous les acteurs' : `≥ ${n} groupes`}
            </button>
          ))}
        </div>
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => toggle(k)}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1', kinds.has(k) ? 'border-border text-foreground' : 'border-transparent text-muted-foreground line-through opacity-60')}
          >
            <Dot color={KIND_COLOR[k]} /> {KIND_PLURAL[k]}
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-border bg-card">
        <svg ref={svgRef} className="h-[68vh] min-h-[480px] w-full touch-none" />
        <div className="pointer-events-none absolute bottom-3 left-3 space-y-1 rounded-md bg-background/80 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-full border-2 border-foreground" /> Groupe exploré
            <span className="ml-2 inline-block size-3 rounded-full border-2 border-primary" /> Groupe lyonnais
          </div>
          <div>{MODES.find((m) => m.id === mode)!.hint} · molette pour zoomer · survol pour isoler</div>
        </div>
        {nodes.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Rien à afficher avec ces filtres.</div>}
      </div>
    </div>
  );
}
