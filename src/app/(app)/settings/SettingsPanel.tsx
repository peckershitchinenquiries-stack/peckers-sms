'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Icon,
  Input,
  Modal,
  RadioGroup,
  Select,
  Stepper,
  Table,
  Tabs,
  Toggle,
  Tooltip,
  useToast,
} from '@/components/ui'
import {
  createStaffAccount,
  resetStaffPassword,
  setParLevel,
  setPrepSite,
  setSauceActive,
  updateAppSettings,
  updateStaffAccount,
  upsertSauce,
} from '@/lib/actions/settings'
import { APP_TIMEZONE, describePrepDays, formatDateOnly, normalisePrepWeekdays } from '@/lib/date'
import { formatMl } from '@/lib/utils/volume'
import type { AppSettings, ParLevel, Profile, Sauce, Site } from '@/lib/types/database'

type Tab = 'prep' | 'sauces' | 'pars' | 'staff' | 'app'

export interface SettingsPanelProps {
  sauces: Sauce[]
  parLevels: ParLevel[]
  staff: Profile[]
  sites: Site[]
  settings: AppSettings
  currentProfileId: string
}

export function SettingsPanel({
  sauces,
  parLevels,
  staff,
  sites,
  settings,
  currentProfileId,
}: SettingsPanelProps) {
  const [tab, setTab] = React.useState<Tab>('prep')

  return (
    <div className="space-y-6">
      <Tabs
        aria-label="Settings sections"
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        items={[
          { value: 'prep', label: 'Prep days', icon: 'calendar' },
          { value: 'sauces', label: 'Sauces', icon: 'droplet', count: sauces.filter((s) => s.active).length },
          { value: 'pars', label: 'Minimum stock', icon: 'scale' },
          { value: 'staff', label: 'Staff', icon: 'users', count: staff.filter((s) => s.active).length },
          { value: 'app', label: 'Advanced', icon: 'settings' },
        ]}
      />

      {tab === 'prep' ? <PrepTab settings={settings} sites={sites} /> : null}
      {tab === 'sauces' ? <SaucesTab sauces={sauces} /> : null}
      {tab === 'pars' ? <ParsTab sauces={sauces} parLevels={parLevels} sites={sites} /> : null}
      {tab === 'staff' ? (
        <StaffTab staff={staff} sites={sites} currentProfileId={currentProfileId} />
      ) : null}
      {tab === 'app' ? <AppTab settings={settings} /> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Prep days and the prep kitchen                                             */
/* -------------------------------------------------------------------------- */

/** Monday-first, because that is how a rota is read. */
const WEEKDAY_PICKER = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

function PrepTab({ settings, sites }: { settings: AppSettings; sites: Site[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()

  const [days, setDays] = React.useState<number[]>(() =>
    normalisePrepWeekdays(settings.prep_weekdays),
  )

  const saved = normalisePrepWeekdays(settings.prep_weekdays)
  const dirty =
    days.length !== saved.length || days.some((day, index) => day !== saved[index])

  const toggleDay = (day: number) => {
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    )
  }

  const save = () => {
    startTransition(async () => {
      const result = await updateAppSettings({ prepWeekdays: days })
      if (result.ok) {
        toast({
          tone: 'success',
          title: 'Prep days updated',
          description: `Sauce is now prepared on ${describePrepDays(days)}.`,
        })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not save', description: result.error })
      }
    })
  }

  const prepSite = sites.find((site) => site.is_prep_site) ?? null

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          eyebrow="Schedule"
          title="Which days is sauce prepared?"
          description="Change this whenever the rota changes. The planner, the kitchen checklist and every “next delivery” date follow it straight away."
        />

        <div className="flex flex-wrap gap-2">
          {WEEKDAY_PICKER.map((day) => {
            const selected = days.includes(day.value)
            return (
              <button
                key={day.value}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleDay(day.value)}
                className={`h-tap min-w-[4.25rem] rounded-lg border-2 px-3 text-sm font-semibold transition-colors duration-fast focus-ring ${
                  selected
                    ? 'border-brand bg-brand-soft text-brand-on-soft'
                    : 'border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink'
                }`}
              >
                {day.label}
              </button>
            )
          })}
        </div>

        <p className="mt-4 text-sm text-ink-muted">
          {days.length === 0 ? (
            <span className="text-danger">Pick at least one day.</span>
          ) : (
            <>
              Sauce is prepared on <strong className="text-ink">{describePrepDays(days)}</strong>.
              Each batch has to last until the next prep day.
            </>
          )}
        </p>

        <div className="mt-5">
          <Button
            size="lg"
            leadingIcon="check"
            loading={busy}
            disabled={days.length === 0 || !dirty}
            onClick={save}
          >
            {dirty ? 'Save prep days' : 'Saved'}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Location"
          title="Where is sauce prepared?"
          description="Only this restaurant sees the planner, the prep checklist and the delivery run. Everywhere else just logs what it uses."
        />

        <div className="space-y-2.5">
          {sites.map((site) => (
            <PrepSiteOption key={site.id} site={site} selected={site.id === prepSite?.id} />
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-subtle">
          Sauce made here is delivered out to the others. Staff at a receiving restaurant only ever
          see their daily usage, stock and expiry dates.
        </p>
      </Card>
    </div>
  )
}

function PrepSiteOption({ site, selected }: { site: Site; selected: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={selected || busy}
      onClick={() =>
        startTransition(async () => {
          const result = await setPrepSite(site.id)
          if (result.ok) {
            toast({ tone: 'success', title: `${site.name} now prepares the sauce` })
            router.refresh()
          } else {
            toast({ tone: 'danger', title: 'Could not change', description: result.error })
          }
        })
      }
      className={`flex w-full items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors duration-fast focus-ring disabled:cursor-default ${
        selected
          ? 'border-brand bg-brand-soft'
          : 'border-border bg-surface hover:border-border-strong'
      }`}
    >
      <Icon
        name={selected ? 'chef-hat' : 'map-pin'}
        size={18}
        className={selected ? 'text-brand' : 'text-ink-muted'}
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${selected ? 'text-brand-on-soft' : 'text-ink'}`}>
          {site.name}
        </span>
        <span className="block text-xs text-ink-muted">
          {selected ? 'Prepares sauce and delivers it out' : 'Receives deliveries'}
        </span>
      </span>
      {selected ? <Icon name="check" size={17} className="text-brand" /> : null}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Sauces                                                                     */
/* -------------------------------------------------------------------------- */

function SaucesTab({ sauces }: { sauces: Sauce[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()

  const [editing, setEditing] = React.useState<Sauce | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deactivating, setDeactivating] = React.useState<Sauce | null>(null)
  const [form, setForm] = React.useState<{ name: string }>({ name: '' })

  const openCreate = () => {
    setForm({ name: '' })
    setCreating(true)
  }

  const openEdit = (sauce: Sauce) => {
    setForm({ name: sauce.name })
    setEditing(sauce)
  }

  const save = () => {
    startTransition(async () => {
      const result = await upsertSauce({
        id: editing?.id,
        name: form.name,
        active: editing?.active ?? true,
      })
      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not save', description: result.error })
        return
      }
      toast({
        tone: 'success',
        title: editing ? 'Sauce updated' : 'Sauce added',
        description: editing
          ? undefined
          : 'It starts with no usage history, so the forecast will use its par level until data builds up.',
      })
      setCreating(false)
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <>
      <Card padded={false}>
        <div className="border-b border-border p-5">
          <CardHeader
            className="mb-0"
            eyebrow={`${sauces.filter((sauce) => sauce.active).length} active`}
            title="House sauces"
            description="Every batch is packed into whichever mix of bag sizes wastes the least. Deactivate rather than delete — historical batches must stay readable."
            actions={
              <Button leadingIcon="plus" size="md" onClick={openCreate}>
                Add sauce
              </Button>
            }
          />
        </div>

        <Table
          rows={sauces}
          rowKey={(sauce) => sauce.id}
          className="rounded-none border-0"
          stickyHeader={false}
          rowTone={(sauce) => (sauce.active ? 'default' : 'warning')}
          empty={{
            icon: 'droplet',
            title: 'No sauces yet',
            description: 'Add the first sauce and it will appear on every prep plan.',
            action: <Button leadingIcon="plus" onClick={openCreate}>Add sauce</Button>,
          }}
          columns={[
            {
              key: 'name',
              header: 'Sauce',
              cell: (sauce) => (
                <span className={sauce.active ? 'font-medium text-ink' : 'text-ink-muted line-through'}>
                  {sauce.name}
                </span>
              ),
            },
            {
              key: 'introduced',
              header: 'Introduced',
              hideOnMobile: true,
              cell: (sauce) => (
                <span className="text-ink-muted">
                  {formatDateOnly(sauce.introduced_on, 'd MMM yyyy')}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (sauce) =>
                sauce.active ? (
                  <Badge tone="success" size="sm" icon="check-circle">
                    Active
                  </Badge>
                ) : (
                  <Badge tone="neutral" size="sm" dot>
                    Inactive
                  </Badge>
                ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (sauce) => (
                <div className="flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    leadingIcon="edit"
                    aria-label={`Edit ${sauce.name}`}
                    onClick={() => openEdit(sauce)}
                  />
                  {sauce.active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      leadingIcon="x"
                      aria-label={`Deactivate ${sauce.name}`}
                      onClick={() => setDeactivating(sauce)}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      leadingIcon="refresh-cw"
                      aria-label={`Reactivate ${sauce.name}`}
                      loading={busy}
                      onClick={() =>
                        startTransition(async () => {
                          await setSauceActive({ sauceId: sauce.id, active: true })
                          toast({ tone: 'success', title: `${sauce.name} reactivated` })
                          router.refresh()
                        })
                      }
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        title={editing ? `Edit ${editing.name}` : 'Add a sauce'}
        description={
          editing
            ? undefined
            : 'The sauce is created at both sites with a par level of 0 — set it on the Par levels tab.'
        }
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false)
                setEditing(null)
              }}
            >
              Cancel
            </Button>
            <Button loading={busy} disabled={form.name.trim().length < 2} onClick={save}>
              {editing ? 'Save changes' : 'Add sauce'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="e.g. Smoked Chipotle"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          if (!deactivating) return
          const result = await setSauceActive({ sauceId: deactivating.id, active: false })
          if (result.ok) {
            toast({
              tone: 'warning',
              title: `${deactivating.name} deactivated`,
              description: 'It will stop appearing on new prep plans. Existing bags are unaffected.',
            })
            router.refresh()
          }
        }}
        title={`Deactivate ${deactivating?.name ?? ''}?`}
        description="It disappears from prep plans and usage logging, but all history is kept."
        confirmLabel="Deactivate"
        tone="destructive"
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Par levels                                                                 */
/* -------------------------------------------------------------------------- */

function ParsTab({
  sauces,
  parLevels,
  sites,
}: {
  sauces: Sauce[]
  parLevels: ParLevel[]
  sites: Site[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [, startTransition] = React.useTransition()

  const [drafts, setDrafts] = React.useState<Record<string, number>>({})

  const lookup = React.useMemo(
    () => new Map(parLevels.map((par) => [`${par.sauce_id}:${par.site_id}`, par.target_ml])),
    [parLevels],
  )

  const activeSauces = sauces.filter((sauce) => sauce.active)

  const save = (sauceId: string, siteId: string, value: number) => {
    const key = `${sauceId}:${siteId}`
    setDrafts((current) => ({ ...current, [key]: value }))

    startTransition(async () => {
      const result = await setParLevel({ sauceId, siteId, targetMl: value })
      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not save par level', description: result.error })
      }
      router.refresh()
    })
  }

  return (
    <Card padded={false}>
      <div className="border-b border-border p-5">
        <CardHeader
          className="mb-0"
          eyebrow="Target stock"
          title="Minimum stock per sauce, per restaurant"
          description="A safety net: if the forecast asks for less than this, it tops up to this amount instead. Leave it at 0 to let usage decide entirely."
        />
      </div>

      {activeSauces.length === 0 ? (
        <EmptyState
          icon="scale"
          title="No active sauces"
          description="Add a sauce first and its par levels will appear here."
        />
      ) : (
        <Table
          rows={activeSauces}
          rowKey={(sauce) => sauce.id}
          className="rounded-none border-0"
          stickyHeader={false}
          columns={[
            {
              key: 'sauce',
              header: 'Sauce',
              cell: (sauce) => <span className="font-medium text-ink">{sauce.name}</span>,
            },
            ...sites.map((site) => ({
              key: site.id,
              header: (
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="map-pin" size={12} />
                  {site.name}
                </span>
              ),
              align: 'right' as const,
              width: 'w-44',
              cell: (sauce: Sauce) => {
                const key = `${sauce.id}:${site.id}`
                const value = drafts[key] ?? lookup.get(key) ?? 0
                return (
                  <div className="flex justify-end">
                    <Stepper
                      size="sm"
                      value={value}
                      min={0}
                      max={20_000}
                      step={100}
                      unit="ml"
                      onChange={(next) => save(sauce.id, site.id, next)}
                    />
                  </div>
                )
              },
            })),
          ]}
        />
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

function StaffTab({
  staff,
  sites,
  currentProfileId,
}: {
  staff: Profile[]
  sites: Site[]
  currentProfileId: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()

  const [creating, setCreating] = React.useState(false)
  const [resetting, setResetting] = React.useState<Profile | null>(null)
  const [newPassword, setNewPassword] = React.useState('')
  const [form, setForm] = React.useState<{
    email: string
    fullName: string
    role: 'manager' | 'staff'
    siteId: string | null
    password: string
  }>({ email: '', fullName: '', role: 'staff', siteId: sites[0]?.id ?? null, password: '' })

  const create = () => {
    startTransition(async () => {
      const result = await createStaffAccount(form)
      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not create account', description: result.error })
        return
      }
      toast({
        tone: 'success',
        title: 'Account created',
        description: `${form.fullName} can sign in with ${form.email}.`,
      })
      setCreating(false)
      setForm({ email: '', fullName: '', role: 'staff', siteId: sites[0]?.id ?? null, password: '' })
      router.refresh()
    })
  }

  return (
    <>
      <Card padded={false}>
        <div className="border-b border-border p-5">
          <CardHeader
            className="mb-0"
            eyebrow={`${staff.filter((person) => person.active).length} active`}
            title="Staff accounts"
            description="Kitchen staff only ever see their own site. Managers see and act across both."
            actions={
              <Button leadingIcon="plus" size="md" onClick={() => setCreating(true)}>
                Add person
              </Button>
            }
          />
        </div>

        <Table
          rows={staff}
          rowKey={(person) => person.id}
          className="rounded-none border-0"
          stickyHeader={false}
          rowTone={(person) => (person.active ? 'default' : 'warning')}
          empty={{ icon: 'users', title: 'No accounts yet', description: 'Add the first team member.' }}
          columns={[
            {
              key: 'name',
              header: 'Name',
              cell: (person) => (
                <div>
                  <span className={person.active ? 'font-medium text-ink' : 'text-ink-muted'}>
                    {person.full_name}
                    {person.id === currentProfileId ? ' (you)' : ''}
                  </span>
                  <span className="block text-2xs text-ink-subtle">{person.email}</span>
                </div>
              ),
            },
            {
              key: 'role',
              header: 'Role',
              cell: (person) => (
                <Badge tone={person.role === 'manager' ? 'brand' : 'neutral'} size="sm" dot>
                  {person.role === 'manager' ? 'Manager' : 'Kitchen staff'}
                </Badge>
              ),
            },
            {
              key: 'site',
              header: 'Site',
              hideOnMobile: true,
              cell: (person) => (
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <Icon name="map-pin" size={13} />
                  {person.role === 'manager'
                    ? 'Both sites'
                    : (sites.find((site) => site.id === person.site_id)?.name ?? 'Unassigned')}
                </span>
              ),
            },
            {
              key: 'active',
              header: 'Active',
              align: 'right',
              cell: (person) => (
                <div className="flex justify-end">
                  <Tooltip
                    content={
                      person.id === currentProfileId
                        ? 'You cannot deactivate your own account.'
                        : person.active
                          ? 'Deactivate — they will lose access immediately.'
                          : 'Reactivate this account.'
                    }
                  >
                    <span>
                      <Toggle
                        size="sm"
                        checked={person.active}
                        disabled={person.id === currentProfileId || busy}
                        onChange={(active) =>
                          startTransition(async () => {
                            const result = await updateStaffAccount({
                              profileId: person.id,
                              active,
                            })
                            if (result.ok) {
                              toast({
                                tone: active ? 'success' : 'warning',
                                title: `${person.full_name} ${active ? 'reactivated' : 'deactivated'}`,
                              })
                              router.refresh()
                            } else {
                              toast({ tone: 'danger', title: 'Could not update', description: result.error })
                            }
                          })
                        }
                      />
                    </span>
                  </Tooltip>
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (person) => (
                <Button
                  size="sm"
                  variant="ghost"
                  leadingIcon="lock"
                  onClick={() => {
                    setNewPassword('')
                    setResetting(person)
                  }}
                >
                  Reset password
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add a team member"
        description="They can sign in straight away with the password you set here."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!form.email || !form.fullName || form.password.length < 8}
              onClick={create}
            >
              Create account
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Full name"
            required
            value={form.fullName}
            onChange={(event) =>
              setForm((current) => ({ ...current, fullName: event.target.value }))
            }
            placeholder="e.g. Swathi Raman"
          />
          <Input
            label="Email"
            type="email"
            required
            leadingIcon="mail"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="name@peckers.dev"
          />
          <RadioGroup
            label="Role"
            variant="card"
            value={form.role}
            onChange={(role) => setForm((current) => ({ ...current, role }))}
            options={[
              {
                value: 'staff',
                label: 'Kitchen staff',
                description: 'Logs prep and usage for one site only.',
              },
              {
                value: 'manager',
                label: 'Manager',
                description: 'Full access across both sites, plus settings and exports.',
              },
            ]}
          />
          {form.role === 'staff' ? (
            <Select
              label="Site"
              required
              value={form.siteId}
              onChange={(siteId) => setForm((current) => ({ ...current, siteId }))}
              options={sites.map((site) => ({
                value: site.id,
                label: site.name,
                icon: 'map-pin' as const,
              }))}
            />
          ) : null}
          <Input
            label="Temporary password"
            type="password"
            required
            leadingIcon="lock"
            value={form.password}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
            hint="At least 8 characters. Ask them to change it after first sign-in."
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        title={`Reset password for ${resetting?.full_name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={newPassword.length < 8}
              onClick={() =>
                startTransition(async () => {
                  if (!resetting) return
                  const result = await resetStaffPassword({
                    profileId: resetting.id,
                    password: newPassword,
                  })
                  if (result.ok) {
                    toast({ tone: 'success', title: 'Password reset' })
                    setResetting(null)
                  } else {
                    toast({ tone: 'danger', title: 'Could not reset', description: result.error })
                  }
                })
              }
            >
              Set new password
            </Button>
          </>
        }
      >
        <Input
          label="New password"
          type="password"
          leadingIcon="lock"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          hint="At least 8 characters."
          autoFocus
        />
      </Modal>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* App settings                                                               */
/* -------------------------------------------------------------------------- */

function AppTab({ settings }: { settings: AppSettings }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()

  const [form, setForm] = React.useState({
    timezone: settings.timezone,
    digestHour: settings.digest_hour,
    recipients: settings.digest_recipients.join(', '),
    lowStockAlertsEnabled: settings.low_stock_alerts_enabled,
    forecastBuffer: Math.round(Number(settings.forecast_buffer) * 100),
    forecastWindowDays: settings.forecast_window_days,
    bagSizes: settings.bag_sizes_ml.join(', '),
  })

  const parsedBagSizes = form.bagSizes
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
  const bagSizesValid =
    parsedBagSizes.length > 0 && parsedBagSizes.every((size) => size % 100 === 0)

  const save = () => {
    startTransition(async () => {
      const result = await updateAppSettings({
        timezone: form.timezone,
        digestHour: form.digestHour,
        digestRecipients: form.recipients
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        lowStockAlertsEnabled: form.lowStockAlertsEnabled,
        forecastBuffer: form.forecastBuffer / 100,
        forecastWindowDays: form.forecastWindowDays,
        bagSizesMl: bagSizesValid ? parsedBagSizes : undefined,
      })

      if (result.ok) {
        toast({ tone: 'success', title: 'Settings saved' })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not save', description: result.error })
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          eyebrow="Forecast engine"
          title="How suggestions are calculated"
          description="These two numbers shape every quantity the planner suggests."
        />
        <div className="space-y-6">
          <Stepper
            label="Rolling window"
            value={form.forecastWindowDays}
            onChange={(forecastWindowDays) =>
              setForm((current) => ({ ...current, forecastWindowDays }))
            }
            min={7}
            max={90}
            step={7}
            unit="days"
            hint="How far back the burn rate is measured. 28 days (4 weeks) is the default and is also the minimum for weekday pattern detection."
          />
          <Stepper
            label="Safety buffer"
            value={form.forecastBuffer}
            onChange={(forecastBuffer) => setForm((current) => ({ ...current, forecastBuffer }))}
            min={100}
            max={200}
            step={5}
            unit="%"
            hint="Applied on top of projected need. 110% means +10% headroom — higher reduces stock-outs but increases waste."
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Packing"
          title="Available bag sizes"
          description="Every batch is packed into whichever mix of these sizes wastes the least volume."
        />
        <Input
          label="Sizes (ml)"
          value={form.bagSizes}
          onChange={(event) => setForm((current) => ({ ...current, bagSizes: event.target.value }))}
          placeholder="300, 500, 1000, 2000"
          error={!bagSizesValid ? 'Enter at least one positive, whole multiple of 100ml, comma separated.' : undefined}
          hint={
            bagSizesValid
              ? `Preview: ${parsedBagSizes.map((size) => formatMl(size)).join(' · ')}`
              : 'Comma separated, e.g. 300, 500, 1000, 2000.'
          }
        />
      </Card>

      <Card>
        <CardHeader
          eyebrow="Notifications"
          title="Daily digest and alerts"
          description="The digest lists everything amber and red across both sites."
        />
        <div className="space-y-6">
          <Toggle
            checked={form.lowStockAlertsEnabled}
            onChange={(lowStockAlertsEnabled) =>
              setForm((current) => ({ ...current, lowStockAlertsEnabled }))
            }
            label="Low-stock alerts"
            description="Raise an alert when a sauce is on track to run out before the next prep day."
          />
          <Stepper
            label="Digest hour"
            value={form.digestHour}
            onChange={(digestHour) => setForm((current) => ({ ...current, digestHour }))}
            min={0}
            max={23}
            unit=":00"
            hint="The scheduled Edge Function's cron must match this — see the README."
          />
          <Input
            label="Digest recipients"
            value={form.recipients}
            onChange={(event) =>
              setForm((current) => ({ ...current, recipients: event.target.value }))
            }
            placeholder="rishi@peckers.dev, ops@peckers.dev"
            hint="Comma separated. Leave empty to disable the email (in-app alerts keep working)."
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Regional"
          title="Timezone"
          description="Every “today”, “expiring today” and “next prep day” decision resolves through this."
        />
        <Select
          label="Business timezone"
          value={form.timezone}
          onChange={(timezone) => setForm((current) => ({ ...current, timezone }))}
          options={[
            { value: 'Europe/London', label: 'Europe/London', description: 'UK — GMT / BST' },
            { value: 'Europe/Dublin', label: 'Europe/Dublin' },
            { value: 'Europe/Paris', label: 'Europe/Paris' },
            { value: 'UTC', label: 'UTC' },
          ]}
          hint={`The app is currently rendering dates in ${APP_TIMEZONE} (set by NEXT_PUBLIC_APP_TIMEZONE). Change that env var to match if you switch this.`}
        />
      </Card>

      <Card>
        <CardHeader
          eyebrow="Fixed rules"
          title="Shelf life"
          description="These are enforced by the database itself, so they hold no matter who logs what."
        />
        <dl className="space-y-3">
          {[
            ['Sealed bag', '5 days from the day it was made'],
            ['Once opened', '2 days, never beyond the sealed date'],
            ['Coverage', 'Each batch must last until the next prep day'],
            ['Prep hours', 'Recorded from start to finish on the prep screen'],
          ].map(([term, definition]) => (
            <div key={term} className="flex items-baseline justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
              <dt className="text-sm font-medium text-ink">{term}</dt>
              <dd className="text-right text-sm text-ink-muted">{definition}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="lg:col-span-2">
        <Button size="lg" leadingIcon="check" loading={busy} disabled={!bagSizesValid} onClick={save}>
          Save settings
        </Button>
      </div>
    </div>
  )
}
