'use client';

import { useActivities } from '@/hooks/use-activities';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatRelativeDate } from '@/lib/utils';
import { Mail, MessageSquare, ArrowRightLeft, StickyNote, Music, Activity } from 'lucide-react';
import type { ActivityType } from '@/types/database';

const ACTIVITY_ICONS: Record<ActivityType, typeof Mail> = {
  email_sent: Mail,
  reply_received: MessageSquare,
  status_change: ArrowRightLeft,
  note: StickyNote,
  concert_played: Music,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  email_sent: 'text-blue-500 bg-blue-500/10',
  reply_received: 'text-green-500 bg-green-500/10',
  status_change: 'text-purple-500 bg-purple-500/10',
  note: 'text-yellow-500 bg-yellow-500/10',
  concert_played: 'text-primary bg-primary/10',
};

export function ActivityFeed() {
  const { data: activities, isLoading } = useActivities(15);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Activité récente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!activities || activities.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucune activité récente</p>
          </div>
        ) : (
          <ScrollArea className="h-72">
            <div className="space-y-3 pr-4">
              {activities.map((activity) => {
                const Icon = ACTIVITY_ICONS[activity.type as ActivityType] || Activity;
                const colorClass = ACTIVITY_COLORS[activity.type as ActivityType] || 'text-gray-500 bg-gray-500/10';
                return (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className={`rounded-full p-1.5 shrink-0 ${colorClass}`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{activity.content}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {activity.venue && (
                          <span className="text-xs text-muted-foreground truncate">
                            {(activity.venue as { name: string }).name}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeDate(activity.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
