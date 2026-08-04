import { Suspense } from 'react'
import { AppShell } from '@/components/app/AppShell'
import { requireSession } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, sites, isManager } = await requireSession()

  const supabase = createServerSupabase()
  const { count } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)

  return (
    // AppShell reads useSearchParams for the site switcher, so it needs a
    // Suspense boundary to stay statically analysable.
    <Suspense fallback={null}>
      <AppShell
        profile={profile}
        sites={sites}
        isManager={isManager}
        unresolvedAlerts={count ?? 0}
      >
        {children}
      </AppShell>
    </Suspense>
  )
}
