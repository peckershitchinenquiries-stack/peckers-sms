'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { motion as motionTokens } from '@/lib/design/tokens'
import { Icon } from './Icon'
import { Skeleton } from './Skeleton'
import { EmptyState, type EmptyStateProps } from './EmptyState'

export interface Column<Row> {
  key: string
  header: React.ReactNode
  /** Cell renderer. Keep it pure — rows animate on reorder. */
  cell: (row: Row, index: number) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  /** Tailwind width class, e.g. `w-32`. */
  width?: string
  sortable?: boolean
  /** Hides the column below the `sm` breakpoint. */
  hideOnMobile?: boolean
}

export interface TableProps<Row> {
  columns: Array<Column<Row>>
  rows: Row[]
  rowKey: (row: Row, index: number) => string
  loading?: boolean
  skeletonRows?: number
  empty?: EmptyStateProps
  onRowClick?: (row: Row) => void
  /** Adds a subtle tint to a row, e.g. for expiring stock. */
  rowTone?: (row: Row) => 'default' | 'warning' | 'danger'
  sort?: { key: string; direction: 'asc' | 'desc' } | null
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' }) => void
  /** Sticky header — on by default for long stock grids. */
  stickyHeader?: boolean
  caption?: string
  className?: string
}

const alignClasses = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const

/**
 * Data table with animated row reordering, sortable headers, skeleton loading
 * and a designed empty state. Horizontally scrollable on narrow screens.
 */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 6,
  empty,
  onRowClick,
  rowTone,
  sort,
  onSortChange,
  stickyHeader = true,
  caption,
  className,
}: TableProps<Row>) {
  const handleSort = (key: string) => {
    if (!onSortChange) return
    const direction = sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange({ key, direction })
  }

  if (!loading && rows.length === 0 && empty) {
    return (
      <div className={cn('rounded-xl border border-border bg-surface', className)}>
        <EmptyState {...empty} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-xl border border-border bg-surface',
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}

        <thead
          className={cn(
            'bg-surface-sunken',
            stickyHeader && 'sticky top-0 z-sticky',
          )}
        >
          <tr>
            {columns.map((column) => {
              const isSorted = sort?.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn(
                    'whitespace-nowrap border-b border-border px-4 py-3 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-subtle',
                    alignClasses[column.align ?? 'left'],
                    column.width,
                    column.hideOnMobile && 'hidden sm:table-cell',
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded transition-colors hover:text-ink focus-ring',
                        isSorted && 'text-ink',
                        column.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {column.header}
                      <Icon
                        name={
                          isSorted
                            ? sort.direction === 'asc'
                              ? 'chevron-up'
                              : 'chevron-down'
                            : 'chevrons-up-down'
                        }
                        size={12}
                        className={cn(!isSorted && 'opacity-45')}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b border-border last:border-0">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn('px-4 py-3.5', column.hideOnMobile && 'hidden sm:table-cell')}
                    >
                      <Skeleton className="h-4 w-full max-w-[8rem]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, index) => {
                const tone = rowTone?.(row) ?? 'default'
                return (
                  <motion.tr
                    key={rowKey(row, index)}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: motionTokens.duration.base }}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === 'Enter') onRowClick(row)
                          }
                        : undefined
                    }
                    className={cn(
                      'border-b border-border transition-colors duration-fast last:border-0',
                      tone === 'warning' && 'bg-warning-soft/40',
                      tone === 'danger' && 'bg-danger-soft/40',
                      onRowClick && 'cursor-pointer hover:bg-surface-sunken focus-ring-inset',
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'px-4 py-3.5 text-ink',
                          alignClasses[column.align ?? 'left'],
                          column.align === 'right' && 'tabular-nums',
                          column.hideOnMobile && 'hidden sm:table-cell',
                        )}
                      >
                        {column.cell(row, index)}
                      </td>
                    ))}
                  </motion.tr>
                )
              })}
        </tbody>
      </table>
    </div>
  )
}
