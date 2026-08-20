import { Skeleton, SkeletonCard, SkeletonList, SkeletonStatGrid } from '@/components/ui'

/** Mirrors PageHeader's layout so the skeleton doesn't jump when real content lands. */
export function HeaderSkeleton() {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <Skeleton variant="text" className="h-3 w-20" />
        <Skeleton className="mt-2 h-8 w-56" />
        <Skeleton variant="text" className="mt-3 w-72" />
      </div>
      <Skeleton className="h-10 w-32 shrink-0" />
    </header>
  )
}

/** Dashboard-style page: header, stat row, then a couple of wide panels. */
export function DashboardSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <SkeletonStatGrid count={4} />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <SkeletonCard lines={5} className="lg:col-span-2" />
        <SkeletonCard lines={5} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </>
  )
}

/** List/table-heavy page: header, optional stat row, then a row list. */
export function ListPageSkeleton({ withStats = false, rows = 6 }: { withStats?: boolean; rows?: number }) {
  return (
    <>
      <HeaderSkeleton />
      {withStats ? <div className="mb-6"><SkeletonStatGrid count={4} /></div> : null}
      <SkeletonList rows={rows} />
    </>
  )
}

/** Form/settings-style page: header, tab strip, then a stacked form card. */
export function FormPageSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="mb-5 flex gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      <SkeletonCard lines={6} />
    </>
  )
}
