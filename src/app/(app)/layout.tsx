import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CommandPalette } from '@/components/layout/command-palette';
import { AppShell } from '@/components/layout/app-shell';
import { GlobalCreate } from '@/components/layout/global-create';
import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import { MailSync } from '@/components/messages/mail-sync';

export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <CommandPalette />
      <GlobalCreate />
      <AppShell>{children}</AppShell>
      <MobileTabBar />
      <MailSync />
    </div>
  );
}
