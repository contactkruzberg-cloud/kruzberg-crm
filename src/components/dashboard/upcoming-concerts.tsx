'use client';

import { useDeals } from '@/hooks/use-deals';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { formatDate } from '@/lib/utils';
import { Calendar, Music } from 'lucide-react';

export function UpcomingConcerts() {
  const { data: deals, isLoading } = useDeals();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const concerts = (deals || [])
    .filter((d) => d.stage === 'confirme' && d.concert_date)
    .sort((a, b) => new Date(a.concert_date!).getTime() - new Date(b.concert_date!).getTime());

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Prochains concerts
          {concerts.length > 0 && (
            <Badge variant="success" className="ml-2">{concerts.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {concerts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Music className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">0 dates confirmées</p>
            <p className="text-xs mt-1">Il est temps d&apos;envoyer quelques emails !</p>
          </div>
        ) : (
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-2">
              {concerts.map((deal) => (
                <div
                  key={deal.id}
                  className="flex-shrink-0 w-44 rounded-lg border p-3 bg-gradient-to-br from-primary/5 to-transparent hover:shadow-md transition-shadow"
                >
                  <p className="font-medium text-sm truncate">{deal.venue?.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {deal.venue?.city}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-primary" />
                    <span className="text-xs font-medium text-primary">
                      {formatDate(deal.concert_date!)}
                    </span>
                  </div>
                  {deal.fee && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {deal.fee}€
                    </p>
                  )}
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
