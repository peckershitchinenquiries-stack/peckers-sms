import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requirePrepAccess } from '@/lib/auth'
import { EmptyState } from '@/components/ui'

export const metadata: Metadata = { title: 'Delivery run' }

/**
 * There is no single delivery run any more — one exists per receiving store —
 * so this is just the door to the first of them. It keeps old links and
 * bookmarks pointing at `/dispatch` working.
 */
export default async function DispatchIndexPage() {
  const context = await requirePrepAccess()
  const [first] = context.dispatchDestinations

  if (!first) {
    return (
      <EmptyState
        icon="truck"
        title="Nowhere to send to"
        description="Every restaurant on the system prepares its own sauce, so there is nothing to deliver. Add another store in Settings to start a delivery run."
      />
    )
  }

  redirect(`/dispatch/${first.id}`)
}
