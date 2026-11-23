import { redirect } from 'next/navigation';

// La Constellation vit désormais dans le Radar.
export default function ConstellationPage() {
  redirect('/radar?vue=constellation');
}
