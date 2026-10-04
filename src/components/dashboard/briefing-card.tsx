'use client';

import { Fragment, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLatestBriefing } from '@/hooks/use-briefings';
import { formatDate } from '@/lib/utils';

// Weekly prospecting briefing written by Claude (MCP tool save_briefing).
// Renders a small Markdown subset: # headings, - lists, **bold**, [text](url).

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g);
  return parts.map((p, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(p);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
    if (link && /^https?:\/\//.test(link[2])) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {link[1]}
        </a>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 space-y-0.5">
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) blocks.push(<h4 key={blocks.length} className="font-semibold mt-3 first:mt-0">{inline(heading[2])}</h4>);
    else if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="text-sm space-y-1.5">{blocks}</div>;
}

export function BriefingCard() {
  const { data: briefing } = useLatestBriefing();
  if (!briefing) return null;
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {briefing.title || 'Briefing de la semaine'}
          <span className="text-xs font-normal text-muted-foreground">· semaine du {formatDate(briefing.week_start)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-96 overflow-y-auto">
        <Markdown source={briefing.content} />
      </CardContent>
    </Card>
  );
}
