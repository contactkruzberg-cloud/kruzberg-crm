import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { calendarToken } from '@/lib/calendar/feed-token';
import { publicBaseUrl } from '@/lib/mcp/context';

// Signed-in only: the subscription URL of the calendar feed.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const token = calendarToken();
  if (!token) return NextResponse.json({ error: 'Abonnement indisponible : MCP_SECRET absent du serveur.' }, { status: 503 });
  return NextResponse.json({ url: `${publicBaseUrl(request)}/api/calendar/${token}` });
}
