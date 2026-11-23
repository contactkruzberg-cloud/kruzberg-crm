import { Suspense } from 'react';
import { Inbox } from '@/components/messages/inbox';

// Messages : toutes les conversations mail de booking@, rangées par lieu,
// contact ou correspondant, avec réponse dans le fil.
export default function MessagesPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}
