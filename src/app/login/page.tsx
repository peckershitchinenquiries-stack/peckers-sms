import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'
import { Icon } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Sign in',
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string }
}) {
  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-2">
      {/* Editorial panel — hidden on tablet portrait and below. */}
      <section className="relative hidden overflow-hidden bg-surface-inverse lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-raw-brand-900 via-raw-brand-800 to-raw-neutral-950" />

        <div className="relative flex h-full flex-col justify-between p-12 text-raw-neutral-50">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-raw-neutral-50/10 backdrop-blur">
              <Icon name="chef-hat" size={20} />
            </span>
            <span className="text-sm font-semibold tracking-tight">Peckers</span>
          </div>

          <div className="max-w-md">
            <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
              Every bag, accounted for.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-raw-neutral-300">
              Forecast the Tuesday and Friday batches, log what actually gets made, and know
              exactly what needs using today — across Stevenage and Hitchin.
            </p>

            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-raw-neutral-50/15 pt-8">
              {[
                { value: '15', label: 'House sauces' },
                { value: '2', label: 'Kitchens' },
                { value: '5 days', label: 'Sealed shelf life' },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-2xl font-semibold tracking-tight">{stat.value}</dt>
                  <dd className="mt-1 text-xs text-raw-neutral-400">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="text-xs text-raw-neutral-500">
            Sauce Management System · Internal use only
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-ink">
              <Icon name="chef-hat" size={20} />
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">Peckers SMS</span>
          </div>

          <p className="eyebrow">Sauce Management System</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Use the account your manager set up for you.
          </p>

          <LoginForm next={searchParams.next} />
        </div>
      </section>
    </main>
  )
}
