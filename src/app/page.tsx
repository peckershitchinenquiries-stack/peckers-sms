import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth'

/** Sends each role to the home view that answers "what do I do right now?". */
export default async function RootPage() {
  const { isManager } = await requireSession()
  redirect(isManager ? '/dashboard' : '/today')
}
