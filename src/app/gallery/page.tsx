'use client'

import * as React from 'react'
import {
  Badge,
  Button,
  Calendar,
  Callout,
  Card,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  DatePicker,
  DateRangePicker,
  Drawer,
  EmptyState,
  Icon,
  InfoHint,
  Input,
  Modal,
  ProgressBar,
  RadioGroup,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonCard,
  SkeletonList,
  SkeletonStatGrid,
  StatCard,
  Stepper,
  Table,
  Tabs,
  Textarea,
  Toggle,
  Tooltip,
  iconNames,
  useToast,
} from '@/components/ui'
import { useTheme } from '@/components/providers/ThemeProvider'
import { today } from '@/lib/date'
import {
  brand,
  danger,
  neutral,
  radii,
  shadows,
  success,
  warning,
} from '@/lib/design/tokens'

/**
 * Design-system gallery. Not part of the product surface — it exists so the
 * whole component library can be reviewed (and regression-checked in both
 * themes) on one page.
 */
export default function GalleryPage() {
  const { resolved, setPreference } = useTheme()
  const { toast } = useToast()

  const [text, setText] = React.useState('')
  const [sauce, setSauce] = React.useState<string | null>('buffalo')
  const [date, setDate] = React.useState<string | null>(today())
  const [range, setRange] = React.useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  })
  const [qty, setQty] = React.useState(6)
  const [notify, setNotify] = React.useState(true)
  const [checked, setChecked] = React.useState(false)
  const [radio, setRadio] = React.useState<string | null>('2L')
  const [tab, setTab] = React.useState('buttons')
  const [segment, setSegment] = React.useState('all')
  const [modalOpen, setModalOpen] = React.useState(false)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [loadingDemo, setLoadingDemo] = React.useState(false)

  return (
    <main id="main" className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Peckers SMS</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-tight text-ink">Design system</h1>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-ink-muted">
            Every control below is built from scratch on the token set in{' '}
            <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-sm">
              lib/design/tokens.ts
            </code>
            . No component library, no native selects or date inputs.
          </p>
        </div>
        <Button
          variant="secondary"
          leadingIcon={resolved === 'dark' ? 'sun' : 'moon'}
          onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
        >
          {resolved === 'dark' ? 'Light' : 'Dark'} mode
        </Button>
      </header>

      <Tabs
        aria-label="Component categories"
        items={[
          { value: 'buttons', label: 'Actions', icon: 'sparkles' },
          { value: 'forms', label: 'Forms', icon: 'edit' },
          { value: 'overlays', label: 'Overlays', icon: 'layout-dashboard' },
          { value: 'data', label: 'Data', icon: 'bar-chart' },
          { value: 'tokens', label: 'Tokens', icon: 'droplet' },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-8"
      />

      {tab === 'buttons' ? (
        <div className="space-y-6">
          <Section title="Buttons" description="Five variants, four sizes, full state coverage.">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="soft">Soft</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Discard bag</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg" leadingIcon="check">
                Large (44px)
              </Button>
              <Button size="xl" leadingIcon="chef-hat">
                Kitchen (52px)
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button loading>Saving</Button>
              <Button disabled>Disabled</Button>
              <Button iconOnly leadingIcon="settings" aria-label="Settings" variant="secondary" />
              <Button trailingIcon="arrow-right" variant="soft">
                Continue
              </Button>
            </div>
          </Section>

          <Section title="Toasts" description="Custom, stacked, auto-dismissing, swipe-safe.">
            <div className="flex flex-wrap gap-3">
              {(['info', 'success', 'warning', 'danger'] as const).map((tone) => (
                <Button
                  key={tone}
                  variant="secondary"
                  onClick={() =>
                    toast({
                      tone,
                      title: `${tone[0].toUpperCase()}${tone.slice(1)} notification`,
                      description: 'Ranch is down to 2 bags at Hitchin.',
                      action: { label: 'View stock', onClick: () => undefined },
                    })
                  }
                >
                  {tone}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="Badges" description="Status never relies on colour alone.">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone="success" icon="check-circle">
                3 days left
              </Badge>
              <Badge tone="warning" icon="alert-circle">
                2 days left
              </Badge>
              <Badge tone="danger" icon="alert-triangle">
                Expires today
              </Badge>
              <Badge tone="brand" dot>
                Sealed
              </Badge>
              <Badge tone="neutral" dot>
                Used
              </Badge>
              <Badge tone="neutral" size="sm">
                1L
              </Badge>
              <Badge tone="brand" size="lg" icon="chef-hat">
                Tuesday prep
              </Badge>
            </div>
          </Section>

          <Section title="Callouts">
            <div className="grid gap-3 md:grid-cols-2">
              <Callout tone="info" title="Based on par level">
                Not enough usage history yet — the suggestion falls back to the configured par.
              </Callout>
              <Callout
                tone="warning"
                title="Ranch will run out"
                action={<Button size="sm" variant="secondary">Pull from Stevenage</Button>}
              >
                Burn rate is 3.2 bags/day with 4 bags in stock and 2 days to Friday prep.
              </Callout>
            </div>
          </Section>
        </div>
      ) : null}

      {tab === 'forms' ? (
        <div className="space-y-6">
          <Section title="Text inputs">
            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label="Sauce name"
                placeholder="e.g. Hot Honey"
                value={text}
                onChange={(event) => setText(event.target.value)}
                hint="Shown on the prep checklist."
              />
              <Input
                label="Target bags"
                type="number"
                suffix="bags"
                leadingIcon="package"
                defaultValue={12}
              />
              <Input label="Email" leadingIcon="mail" error="That address is already in use." />
              <Input label="Locked" leadingIcon="lock" disabled value="stevenage" readOnly />
            </div>
            <Textarea
              label="Notes"
              placeholder="Anything the next shift should know…"
              containerClassName="mt-5"
            />
          </Section>

          <Section
            title="Custom select"
            description="Listbox semantics, typeahead, search, animated checkmarks."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Select
                label="Sauce"
                value={sauce}
                onChange={setSauce}
                options={[
                  { value: 'buffalo', label: 'Buffalo', description: '2L bags', icon: 'flame' },
                  { value: 'ranch', label: 'Ranch', description: '1L bags', icon: 'droplet' },
                  { value: 'katsu', label: 'Katsu Curry', description: '1L bags' },
                  { value: 'mayo', label: 'House Mayo', description: '2L bags', disabled: true },
                ]}
              />
              <Select
                label="Site"
                value="stevenage"
                onChange={() => undefined}
                options={[
                  { value: 'stevenage', label: 'Stevenage', icon: 'map-pin' },
                  { value: 'hitchin', label: 'Hitchin', icon: 'map-pin' },
                ]}
              />
            </div>
          </Section>

          <Section title="Custom calendar" description="Month grid, keyboard nav, prep-day markers.">
            <div className="flex flex-wrap items-start gap-6">
              <div className="rounded-xl border border-border bg-surface">
                <Calendar value={date} onSelect={setDate} highlightPrepDays />
              </div>
              <div className="grid min-w-[16rem] flex-1 gap-5">
                <DatePicker label="Prep date" value={date} onChange={setDate} highlightPrepDays />
                <DateRangePicker label="Report period" from={range.from} to={range.to} onChange={setRange} />
              </div>
            </div>
          </Section>

          <Section title="Toggles, checkboxes, radios, steppers">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <Toggle
                  checked={notify}
                  onChange={setNotify}
                  label="Daily 8am digest"
                  description="Email amber and red items to the manager each morning."
                />
                <Checkbox
                  checked={checked}
                  onChange={setChecked}
                  label="Vacuum packed"
                  description="Ticking this creates the bag records."
                />
                <Stepper label="Bags to prepare" value={qty} onChange={setQty} unit="bags" max={99} />
                <Stepper size="lg" value={qty} onChange={setQty} min={0} max={99} />
              </div>
              <RadioGroup
                label="Bag size"
                variant="card"
                value={radio}
                onChange={setRadio}
                options={[
                  { value: '2L', label: '2 litre', description: 'Buffalo, Mayo, Aioli…' },
                  { value: '1L', label: '1 litre', description: 'Ranch, Katsu, Hot Honey…' },
                ]}
              />
            </div>
          </Section>

          <Section title="Segmented control">
            <SegmentedControl
              aria-label="Site scope"
              value={segment}
              onChange={setSegment}
              options={[
                { value: 'all', label: 'Both sites', icon: 'layout-dashboard' },
                { value: 'stevenage', label: 'Stevenage', icon: 'map-pin' },
                { value: 'hitchin', label: 'Hitchin', icon: 'map-pin' },
              ]}
            />
          </Section>
        </div>
      ) : null}

      {tab === 'overlays' ? (
        <div className="space-y-6">
          <Section title="Modals, drawers and sheets" description="Backdrop blur, focus trap, escape to close.">
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setModalOpen(true)}>Open modal</Button>
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                Open drawer
              </Button>
              <Button variant="secondary" onClick={() => setSheetOpen(true)}>
                Open bottom sheet
              </Button>
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                Confirm dialog
              </Button>
            </div>
          </Section>

          <Section title="Tooltips">
            <div className="flex flex-wrap items-center gap-6">
              <Tooltip content="Sealed bags last 5 days from the prep date.">
                <Button variant="secondary" leadingIcon="info">
                  Hover me
                </Button>
              </Tooltip>
              <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                Suggested bags
                <InfoHint content="Burn rate 2.4/day × 3 days − 4 in stock, +10% buffer." />
              </span>
            </div>
          </Section>

          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Log today's usage"
            description="Opening a bag starts its 2-day countdown."
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModalOpen(false)}>Save usage</Button>
              </>
            }
          >
            <div className="space-y-5">
              <Select
                label="Sauce"
                value={sauce}
                onChange={setSauce}
                options={[
                  { value: 'buffalo', label: 'Buffalo' },
                  { value: 'ranch', label: 'Ranch' },
                ]}
              />
              <Stepper label="Bags opened" value={qty} onChange={setQty} unit="bags" />
            </div>
          </Modal>

          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="Batch detail"
            description="Every bag from this prep session."
            side="right"
          >
            <SkeletonList rows={4} />
          </Drawer>

          <Drawer
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="Quick actions"
            side="bottom"
            size="lg"
          >
            <p className="text-sm text-ink-muted">Drag the handle down to dismiss.</p>
          </Drawer>

          <ConfirmDialog
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => {
              toast({ tone: 'danger', title: 'Bag discarded' })
            }}
            title="Discard this bag?"
            description="It will be recorded as waste against today's date."
            confirmLabel="Discard bag"
            tone="destructive"
          />
        </div>
      ) : null}

      {tab === 'data' ? (
        <div className="space-y-6">
          <Section title="Stat cards">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Bags in stock" value={142} icon="package" tone="brand" hint="Both sites" />
              <StatCard
                label="Expiring today"
                value={6}
                icon="alert-triangle"
                tone="danger"
                trend={{ direction: 'down', label: '−3 vs yesterday' }}
              />
              <StatCard label="Next prep" value="Fri" unit="in 2 days" icon="chef-hat" tone="success" />
              <StatCard label="Waste this month" value="4.2" unit="%" icon="trending-down" tone="warning" />
            </div>
          </Section>

          <Section title="Progress">
            <div className="grid gap-6 md:grid-cols-2">
              <ProgressBar label="Ranch · Hitchin" value={7} max={14} valueLabel="7 / 14 bags" marker={10} markerLabel="Par level: 10" />
              <ProgressBar label="Prep complete" value={11} max={15} valueLabel="11 of 15 sauces" tone="success" />
              <ProgressBar label="Buffalo · Stevenage" value={2} max={12} valueLabel="2 / 12 bags" tone="danger" />
              <ProgressBar label="Katsu · Stevenage" value={5} max={12} valueLabel="5 / 12 bags" tone="warning" />
            </div>
          </Section>

          <Section title="Table" description="Sortable, animated rows, tone-tinted, designed empty state.">
            <Table
              rows={demoRows}
              rowKey={(row) => row.id}
              rowTone={(row) => row.tone}
              columns={[
                { key: 'sauce', header: 'Sauce', cell: (row) => <span className="font-medium">{row.sauce}</span>, sortable: true },
                { key: 'site', header: 'Site', cell: (row) => row.site, hideOnMobile: true },
                { key: 'stock', header: 'Stock', align: 'right', cell: (row) => row.stock, sortable: true },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (row) => (
                    <Badge tone={row.tone === 'danger' ? 'danger' : row.tone === 'warning' ? 'warning' : 'success'} icon={row.tone === 'default' ? 'check-circle' : 'alert-circle'}>
                      {row.status}
                    </Badge>
                  ),
                },
              ]}
            />
          </Section>

          <Section title="Loading states">
            <div className="space-y-5">
              <Button variant="secondary" onClick={() => setLoadingDemo((v) => !v)}>
                {loadingDemo ? 'Show loaded' : 'Show skeletons'}
              </Button>
              {loadingDemo ? (
                <>
                  <SkeletonStatGrid />
                  <div className="grid gap-4 md:grid-cols-2">
                    <SkeletonCard />
                    <SkeletonList rows={3} />
                  </div>
                  <Skeleton className="h-32 w-full" />
                </>
              ) : (
                <EmptyState
                  icon="check-circle"
                  tone="success"
                  title="Nothing expiring today"
                  description="Every bag at this site has 3 or more days of life left. Next prep is Friday."
                  action={<Button variant="secondary" leadingIcon="list">View all stock</Button>}
                />
              )}
            </div>
          </Section>
        </div>
      ) : null}

      {tab === 'tokens' ? (
        <div className="space-y-6">
          <Section title="Semantic palette" description="Green = healthy · Amber = 1–2 days · Red = today.">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Ramp name="Brand" scale={brand} />
              <Ramp name="Success" scale={success} />
              <Ramp name="Warning" scale={warning} />
              <Ramp name="Danger" scale={danger} />
              <Ramp name="Neutral" scale={neutral} />
            </div>
          </Section>

          <Section title="Radii & elevation">
            <div className="flex flex-wrap gap-4">
              {Object.entries(radii)
                .filter(([key]) => key !== 'none' && key !== 'full')
                .map(([key, value]) => (
                  <div key={key} className="text-center">
                    <div
                      className="h-16 w-16 border border-border bg-surface-sunken"
                      style={{ borderRadius: value }}
                    />
                    <p className="mt-1.5 text-2xs text-ink-subtle">{key}</p>
                  </div>
                ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-5">
              {(['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const).map((key) => (
                <div key={key} className="text-center">
                  <div
                    className="h-16 w-24 rounded-lg bg-surface"
                    style={{ boxShadow: shadows[key] }}
                  />
                  <p className="mt-2 text-2xs text-ink-subtle">shadow-{key}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Type scale">
            <div className="space-y-2">
              {/* Classes are written out in full — Tailwind can't see interpolated names. */}
              {(
                [
                  ['5xl', 'text-5xl', 'Manager dashboard'],
                  ['3xl', 'text-3xl', 'Today at Stevenage'],
                  ['xl', 'text-xl', 'Prep checklist'],
                  ['base', 'text-base', 'Body copy sits at 15px for tablet legibility.'],
                  ['sm', 'text-sm', 'Supporting detail and table cells.'],
                  ['xs', 'text-xs', 'Hints, captions and metadata.'],
                ] as const
              ).map(([size, className, sample]) => (
                <p key={size} className={`${className} text-ink`}>
                  <span className="mr-3 inline-block w-12 align-middle text-2xs text-ink-subtle">
                    {size}
                  </span>
                  {sample}
                </p>
              ))}
            </div>
          </Section>

          <Section title="Icon set" description={`${iconNames.length} hand-drawn glyphs, no icon package.`}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
              {iconNames.map((name) => (
                <div
                  key={name}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface p-3"
                >
                  <Icon name={name} size={20} className="text-ink" />
                  <span className="w-full truncate text-center text-[10px] text-ink-subtle">
                    {name}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      ) : null}
    </main>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {children}
    </Card>
  )
}

function Ramp({ name, scale }: { name: string; scale: Record<string, string> }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{name}</p>
      <div className="overflow-hidden rounded-lg border border-border">
        {Object.entries(scale).map(([step, hex]) => (
          <div key={step} className="flex items-center gap-3 px-3 py-1.5" style={{ background: hex }}>
            <span
              className="text-2xs font-semibold tabular-nums"
              style={{ color: Number(step) >= 500 ? '#fff' : '#231F20' }}
            >
              {step}
            </span>
            <span
              className="text-2xs tabular-nums"
              style={{ color: Number(step) >= 500 ? '#ffffffcc' : '#231F20cc' }}
            >
              {hex}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const demoRows: Array<{
  id: string
  sauce: string
  site: string
  stock: number
  status: string
  tone: 'default' | 'warning' | 'danger'
}> = [
  { id: '1', sauce: 'Buffalo', site: 'Stevenage', stock: 12, status: '4 days left', tone: 'default' },
  { id: '2', sauce: 'Ranch', site: 'Hitchin', stock: 3, status: '2 days left', tone: 'warning' },
  { id: '3', sauce: 'Hot Honey', site: 'Stevenage', stock: 1, status: 'Expires today', tone: 'danger' },
  { id: '4', sauce: 'Katsu Curry', site: 'Hitchin', stock: 8, status: '5 days left', tone: 'default' },
]
