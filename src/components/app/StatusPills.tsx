import * as React from 'react'
import { Badge, type BadgeSize } from '@/components/ui/Badge'
import { type ExpiryLevel, expiryIcon, expiryTone } from '@/lib/date'
import { formatMl, formatPack } from '@/lib/utils/volume'
import type { BagStatus } from '@/lib/types/database'

export interface ExpiryBadgeProps {
  level: ExpiryLevel
  label: string
  size?: BadgeSize
}

/**
 * The semantic expiry pill used everywhere stock is shown.
 * Colour is always paired with an icon and words — never colour alone.
 */
export function ExpiryBadge({ level, label, size = 'md' }: ExpiryBadgeProps) {
  return (
    <Badge tone={expiryTone[level]} icon={expiryIcon[level]} size={size}>
      {label}
    </Badge>
  )
}

const bagStatusConfig: Record<
  BagStatus,
  { tone: 'brand' | 'warning' | 'neutral' | 'danger'; label: string }
> = {
  sealed: { tone: 'brand', label: 'Sealed' },
  opened: { tone: 'warning', label: 'Opened' },
  used: { tone: 'neutral', label: 'Used' },
  discarded: { tone: 'danger', label: 'Discarded' },
}

export function BagStatusBadge({ status, size = 'sm' }: { status: BagStatus; size?: BadgeSize }) {
  const config = bagStatusConfig[status]
  return (
    <Badge tone={config.tone} size={size} dot>
      {config.label}
    </Badge>
  )
}

export function BagSizeBadge({ sizeMl }: { sizeMl: number }) {
  return (
    <Badge tone="neutral" size="sm">
      {formatMl(sizeMl)}
    </Badge>
  )
}

/** "2×2000ml + 1×500ml" pack breakdown, as a single neutral badge. */
export function PackBadge({ counts }: { counts: Record<number, number> }) {
  const summary = formatPack(counts)
  if (!summary) {
    return (
      <Badge tone="neutral" size="sm" dot>
        No bags
      </Badge>
    )
  }
  return (
    <Badge tone="neutral" size="sm">
      {summary}
    </Badge>
  )
}

/** Stock health relative to the par level. */
export function StockBadge({
  usable,
  par,
  size = 'md',
}: {
  usable: number
  par: number
  size?: BadgeSize
}) {
  if (par === 0) {
    return (
      <Badge tone="neutral" size={size} dot>
        {formatMl(usable)} in stock
      </Badge>
    )
  }

  const ratio = usable / par
  const tone = ratio >= 0.75 ? 'success' : ratio >= 0.4 ? 'warning' : 'danger'
  const icon = tone === 'success' ? 'check-circle' : tone === 'warning' ? 'alert-circle' : 'alert-triangle'

  return (
    <Badge tone={tone} icon={icon} size={size}>
      {formatMl(usable)} / {formatMl(par)}
    </Badge>
  )
}
