import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { SettingsPanel } from './SettingsPanel'
import { requireManager } from '@/lib/auth'
import { getParLevels, getSauces, getStaff } from '@/lib/queries/catalogue'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const context = await requireManager()

  const [sauces, parLevels, staff] = await Promise.all([
    getSauces({ includeInactive: true }),
    getParLevels(),
    getStaff(),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Prep days, sauces, minimum stock levels and staff accounts."
      />

      <SettingsPanel
        sauces={sauces}
        parLevels={parLevels}
        staff={staff}
        sites={context.allSites}
        settings={context.settings}
        currentProfileId={context.profile.id}
      />
    </>
  )
}
