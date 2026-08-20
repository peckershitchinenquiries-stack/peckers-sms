'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'
import { useEscapeKey, useOnClickOutside } from '@/lib/hooks'
import { useTheme } from '@/components/providers/ThemeProvider'
import { Badge, Button, Icon, type IconName } from '@/components/ui'
import { signOut } from '@/lib/actions/auth'
import type { Profile, Site } from '@/lib/types/database'
import { formatRelativeDay, upcomingPrepDay } from '@/lib/date'

interface NavItem {
  href: string
  label: string
  icon: IconName
  /** Which roles see this entry. */
  roles: Array<'manager' | 'staff'>
  /**
   * Only shown to people involved in preparing sauce. A receiving store cooks
   * nothing, so its staff get a shorter menu rather than screens they can't
   * act on.
   */
  prepOnly?: boolean
  description: string
}

/**
 * Placeholder for the delivery runs, which aren't a fixed menu entry: there is
 * one per receiving store, so with three stores the sidebar carries two of
 * them. It sits in NAV purely to pin where they appear in the order.
 */
const DISPATCH_SLOT = '__dispatch__'

const NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: 'layout-dashboard',
    roles: ['manager'],
    description: 'Everything, every restaurant',
  },
  {
    href: '/today',
    label: 'Today',
    icon: 'home',
    roles: ['staff'],
    description: 'What to do right now',
  },
  {
    href: '/planner',
    label: 'Prep planner',
    icon: 'sparkles',
    roles: ['manager'],
    prepOnly: true,
    description: 'How much to make',
  },
  {
    href: '/prep',
    label: 'Prep checklist',
    icon: 'chef-hat',
    roles: ['manager', 'staff'],
    prepOnly: true,
    description: 'Record what you made',
  },
  {
    href: DISPATCH_SLOT,
    label: 'Send to …',
    icon: 'truck',
    roles: ['manager', 'staff'],
    prepOnly: true,
    description: "Today's delivery run",
  },
  {
    href: '/usage',
    label: 'Daily usage',
    icon: 'clipboard-list',
    roles: ['manager', 'staff'],
    description: 'Log what you used',
  },
  {
    href: '/expiry',
    label: 'Expiry tracker',
    icon: 'clock',
    roles: ['manager', 'staff'],
    description: 'Use it or lose it',
  },
  {
    href: '/alerts',
    label: 'Alerts',
    icon: 'bell',
    roles: ['manager', 'staff'],
    description: 'Stock and expiry warnings',
  },
  {
    href: '/batches',
    label: 'Batch history',
    icon: 'package',
    roles: ['manager'],
    prepOnly: true,
    description: 'What was actually made',
  },
  {
    href: '/overtime',
    label: 'Overtime',
    icon: 'history',
    roles: ['manager', 'staff'],
    prepOnly: true,
    description: 'Prep hours worked',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'settings',
    roles: ['manager'],
    description: 'Sauces, staff and prep days',
  },
]

export interface AppShellProps {
  profile: Profile
  sites: Site[]
  isManager: boolean
  /** Whether this person has anything to do with preparing sauce. */
  canPrep: boolean
  /** Every store the prep kitchen delivers to — one menu entry each. */
  dispatchDestinations: Array<{ id: string; name: string }>
  prepWeekdays: number[]
  unresolvedAlerts: number
  children: React.ReactNode
}

export function AppShell({
  profile,
  sites,
  isManager,
  canPrep,
  dispatchDestinations,
  prepWeekdays,
  unresolvedAlerts,
  children,
}: AppShellProps) {
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  const items = React.useMemo(
    () =>
      NAV.filter(
        (item) => item.roles.includes(profile.role) && (!item.prepOnly || canPrep),
      ).flatMap<NavItem>((item) => {
        if (item.href !== DISPATCH_SLOT) return item
        // The slot expands into one entry per store. No stores to deliver to
        // means no entries at all, rather than a link to an empty screen.
        return dispatchDestinations.map((destination) => ({
          ...item,
          href: `/dispatch/${destination.id}`,
          label: `Send to ${destination.name}`,
          description: `Today's run to ${destination.name}`,
        }))
      }),
    [profile.role, canPrep, dispatchDestinations],
  )

  // Any route change closes the mobile drawer.
  React.useEffect(() => setMobileNavOpen(false), [pathname])
  useEscapeKey(() => setMobileNavOpen(false), mobileNavOpen)

  const nextPrep = upcomingPrepDay(undefined, prepWeekdays)

  return (
    <div className="min-h-dvh bg-canvas">
      {/* ---------------------------------------------------------------- */}
      {/* Sidebar (lg and up)                                              */}
      {/* ---------------------------------------------------------------- */}
      <aside className="fixed inset-y-0 left-0 z-header hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-ink">
            <Icon name="chef-hat" size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink">Peckers</p>
            <p className="truncate text-2xs text-ink-subtle">Sauce Management</p>
          </div>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  active={isActive(pathname, item.href)}
                  badge={item.href === '/alerts' ? unresolvedAlerts : 0}
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-border p-3">
          <div className="rounded-lg bg-surface-sunken p-3">
            <p className="eyebrow">{canPrep ? 'Next prep' : 'Next delivery'}</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {formatRelativeDay(nextPrep.date)}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              has to last {nextPrep.coversDays} days
            </p>
          </div>
        </div>

        <UserPanel profile={profile} sites={sites} isManager={isManager} />
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Mobile / tablet header                                           */}
      {/* ---------------------------------------------------------------- */}
      <header className="glass sticky top-0 z-header flex h-16 items-center justify-between gap-3 border-b border-border px-4 lg:hidden">
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="md"
            iconOnly
            leadingIcon="menu"
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          />
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-ink">
            <Icon name="chef-hat" size={17} />
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">Peckers SMS</span>
        </div>

        <div className="flex items-center gap-1.5">
          {isManager ? <SiteSwitcher sites={sites} compact /> : null}
          <ThemeToggle />
        </div>
      </header>

      <AnimatePresence>
        {mobileNavOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-backdrop bg-overlay/45 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
            <motion.nav
              aria-label="Main"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={motionTokens.ease.softSpring}
              className="fixed inset-y-0 left-0 z-drawer flex w-[17rem] flex-col border-r border-border bg-surface lg:hidden"
            >
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <span className="text-sm font-semibold tracking-tight text-ink">Menu</span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  leadingIcon="x"
                  aria-label="Close navigation"
                  onClick={() => setMobileNavOpen(false)}
                />
              </div>
              <ul className="flex-1 space-y-0.5 overflow-y-auto p-3">
                {items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      active={isActive(pathname, item.href)}
                      badge={item.href === '/alerts' ? unresolvedAlerts : 0}
                      showDescription
                    />
                  </li>
                ))}
              </ul>
              <UserPanel profile={profile} sites={sites} isManager={isManager} />
            </motion.nav>
          </>
        ) : null}
      </AnimatePresence>

      {/* ---------------------------------------------------------------- */}
      {/* Content                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="lg:pl-64">
        {/* Desktop toolbar */}
        <div className="glass sticky top-0 z-sticky hidden h-16 items-center justify-end gap-2 border-b border-border px-6 lg:flex">
          {isManager ? <SiteSwitcher sites={sites} /> : (
            <span className="mr-auto inline-flex items-center gap-1.5 text-sm text-ink-muted">
              <Icon name="map-pin" size={15} />
              {sites[0]?.name ?? 'No site assigned'}
            </span>
          )}
          <ThemeToggle />
        </div>

        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** "Both sites" reads wrong the moment a third store is added. */
function allSitesLabel(count: number): string {
  return count === 2 ? 'Both stores' : 'All stores'
}

function NavLink({
  item,
  active,
  badge,
  showDescription = false,
}: {
  item: NavItem
  active: boolean
  badge: number
  showDescription?: boolean
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-fast focus-ring',
        active ? 'bg-brand-soft text-brand-on-soft' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
      )}
    >
      <Icon name={item.icon} size={18} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {showDescription ? (
          <span className="block truncate text-xs font-normal text-ink-subtle">
            {item.description}
          </span>
        ) : null}
      </span>
      {badge > 0 ? (
        <Badge tone="danger" size="sm">
          {badge}
        </Badge>
      ) : null}
    </Link>
  )
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme()

  return (
    <Button
      variant="ghost"
      size="md"
      iconOnly
      leadingIcon={resolved === 'dark' ? 'sun' : 'moon'}
      aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
      onClick={toggle}
    />
  )
}

/**
 * Site scope lives in the URL (`?site=<id>`), so every server component on the
 * page can read it and staff can't widen their own scope by fiddling with it.
 */
function SiteSwitcher({ sites, compact = false }: { sites: Site[]; compact?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('site') ?? 'all'

  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  useOnClickOutside([rootRef], () => setOpen(false), open)

  const options = [{ id: 'all', name: allSitesLabel(sites.length) }, ...sites]
  const selected = options.find((option) => option.id === current) ?? options[0]

  const select = (siteId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (siteId === 'all') params.delete('site')
    else params.set('site', siteId)
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={cn('relative', !compact && 'mr-auto')}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-border-strong focus-ring"
      >
        <Icon name="map-pin" size={15} className="text-ink-muted" />
        {compact ? null : <span className="max-w-[9rem] truncate">{selected.name}</span>}
        <Icon name="chevron-down" size={14} className="text-ink-subtle" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            role="listbox"
            aria-label="Site scope"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: motionTokens.duration.fast, ease: motionTokens.ease.out }}
            className={cn(
              'absolute top-[calc(100%+6px)] z-popover w-52 overflow-hidden rounded-lg border border-border bg-surface p-1.5 shadow-xl',
              compact ? 'right-0' : 'left-0',
            )}
          >
            {options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === current}
                  onClick={() => select(option.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-sunken focus-ring',
                    option.id === current && 'font-medium text-brand-on-soft',
                  )}
                >
                  <Icon
                    name={option.id === 'all' ? 'layout-dashboard' : 'map-pin'}
                    size={15}
                    className="text-ink-muted"
                  />
                  <span className="flex-1 truncate">{option.name}</span>
                  {option.id === current ? (
                    <Icon name="check" size={15} className="text-brand" />
                  ) : null}
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function UserPanel({
  profile,
  sites,
  isManager,
}: {
  profile: Profile
  sites: Site[]
  isManager: boolean
}) {
  const [pending, startTransition] = React.useTransition()
  const siteName = isManager
    ? allSitesLabel(sites.length)
    : (sites.find((site) => site.id === profile.site_id)?.name ?? 'No site')

  const initials = profile.full_name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-on-soft">
          {initials || '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{profile.full_name}</p>
          <p className="truncate text-xs text-ink-subtle">
            {isManager ? 'Manager' : 'Kitchen staff'} · {siteName}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          leadingIcon="log-out"
          aria-label="Sign out"
          loading={pending}
          onClick={() => startTransition(() => void signOut())}
        />
      </div>
    </div>
  )
}
