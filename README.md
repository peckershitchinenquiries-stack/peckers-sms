# Peckers — Sauce Management System (SMS)

An internal web app for **Peckers**, a UK food chain running two kitchens (**Stevenage** and **Hitchin**) that make **15 house sauces** in-house.

It digitises the whole sauce lifecycle: forecast how much to prepare → log what was actually made → track every vacuum-sealed bag from prep day until it's used or thrown away → warn staff and managers before things go wrong.

---

## Contents

- [The business rules](#the-business-rules)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Supabase setup in detail](#supabase-setup-in-detail)
- [The forecast engine](#the-forecast-engine)
- [Notifications and the daily digest](#notifications-and-the-daily-digest)
- [Deploying](#deploying)
- [Project structure](#project-structure)
- [Design system](#design-system)
- [Testing](#testing)

---

## The business rules

These drive every calculation in the app and are enforced in the database, not just the UI.

| Rule | Detail |
| --- | --- |
| **Prep days** | Tuesday and Friday, 7–11am. This time is paid overtime and must be logged. |
| **Tuesday batch** | Must cover **3 days** — Tue, Wed, Thu. |
| **Friday batch** | Must cover **4 days** — Fri, Sat, Sun, Mon. |
| **Sealed shelf life** | 5 days from the prep date. |
| **Opened shelf life** | 2 days from opening — `opened_expiry = min(sealed_expiry, opened_date + 2 days)`. Opening a bag can only ever shorten its life. |
| **Prep process** | 3 steps per sauce: **Cooked → Blast Chilled (1.5 hr) → Vacuum Packed**. |
| **Bag sizes** | 2L for 5 sauces, 1L for the other 10. Fixed per recipe. |
| **Par levels** | Configurable per sauce **per site**. Acts as a floor on the forecast. |

### The 15 sauces

**2L bags** — Buffalo, Butter Me Up, Garlic Aioli, House Mayo, Supercharged OG
**1L bags** — Hot Honey, Cheese Sauce, Mango Pineapple, Katsu Curry, Peanut Sweet Chilli, Honey Glaze BBQ, Korean Gochujang, Korean Glaze, OG Chilli, Ranch

### Roles

- **Manager** — sees everything across both sites, sets par levels, overrides forecasts, gets alerts, exports payroll CSVs.
- **Kitchen staff** — tied to one site. Logs prep and daily usage, sees today's checklist and what needs using up.

Row Level Security enforces this at the database level: staff physically cannot read or write another site's rows, whatever the client asks for.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 14 (App Router) + React 18 + TypeScript |
| Styling | Tailwind CSS, driven entirely from `src/lib/design/tokens.ts` |
| Components | 100% custom — no MUI/Chakra/shadcn/Bootstrap, no native `<select>` or date inputs |
| Motion | Framer Motion |
| Backend | Next.js Route Handlers + Server Actions, plus a Supabase Edge Function for cron |
| Database & auth | Supabase (PostgreSQL) with RLS, Supabase Auth (email/password, JWT sessions) |
| Client data | TanStack Query, with React Server Components where they fit better |
| Dates | date-fns + date-fns-tz, all resolved through a single configurable timezone |
| Email | Resend |
| Export | Hand-rolled CSV writer (no paid libraries) |
| Hosting | Vercel (frontend) + Supabase (database, auth, edge functions) |

---

## Quick start

**Prerequisites:** Node 20+, a Supabase project (free tier is fine), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
#    then fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
#    and SUPABASE_SERVICE_ROLE_KEY from Supabase → Project Settings → API

# 3. Apply the schema
supabase link --project-ref <your-project-ref>
supabase db push

# 4. Seed sites, sauces, demo users and 6 weeks of realistic history
npm run db:seed

# 5. Run
npm run dev
```

Open <http://localhost:3000> and sign in with one of the demo accounts below.

The design system is browsable without signing in at <http://localhost:3000/gallery>.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next.js config) |
| `npm test` | Vitest — the forecast engine and date-rule suite |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:reset` | Reset a **local** Supabase database and re-run every migration |
| `npm run db:seed` | Populate reference data, demo users and demo history |

---

## Demo accounts

Created by `npm run db:seed`. Password for all three: **`PeckersSMS2026!`**
(override with `SEED_DEMO_PASSWORD` before seeding).

| Email | Name | Role | Site |
| --- | --- | --- | --- |
| `manager@peckers.dev` | Rishi Patel | Manager | Both |
| `staff@peckers.dev` | Swathi Raman | Kitchen staff | Stevenage |
| `hitchin@peckers.dev` | Dan Okafor | Kitchen staff | Hitchin |

> These are demo credentials for a local/staging environment. Change them (or delete the accounts) before this touches production.

### What the seed gives you

- 2 sites, 15 sauces with correct bag sizes, par levels tuned per site
- **6 weeks** of daily usage with deliberate, discoverable weekday patterns — Ranch and Garlic Aioli spike on Fridays, Buffalo and Supercharged OG on Saturdays, Hot Honey on Sundays
- Historical prep sessions on every Tuesday and Friday, with bags aged and consumed correctly (old batches resolved as used/discarded, recent ones still live)
- Live stock containing a realistic mix of sealed, opened and expiring-today bags
- Mango Pineapple deliberately introduced ~11 days ago, so you can see the engine's **new sauce / partial window** path in action
- A forecast plan already built for the upcoming prep day at both sites

---

## Supabase setup in detail

### 1. Create the project

Supabase dashboard → **New project**. Note the project ref, URL, anon key and service-role key.

### 2. Apply migrations

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Migrations run in order:

| File | Contents |
| --- | --- |
| `20260801000000_init.sql` | Enums, tables, indexes, the shelf-life trigger, the auth→profile trigger |
| `20260801000001_views.sql` | `bag_expiry`, `live_stock`, `overtime_logs`, `prep_vs_plan`, `usage_by_weekday` (all `security_invoker`) |
| `20260801000002_rls.sql` | RLS helper functions and every policy |
| `20260801000003_functions.sql` | `open_bags`, `record_usage`, `create_batch_bags`, `consume_bags`, `resolve_alert`, `forecast_inputs` |

To develop against a local stack instead:

```bash
supabase start
supabase db reset   # applies all migrations to the local database
```

### 3. Disable public sign-up

Accounts are created by a manager, never self-served. In **Authentication → Providers → Email**, turn **Enable sign-ups** off. (`supabase/config.toml` already sets this for local development.)

### 4. Seed

```bash
npm run db:seed
```

The seed is re-runnable: it clears transactional data (bags, usage, sessions, plans, alerts), upserts reference data, and resets the demo accounts' passwords rather than failing on duplicates.

### Schema at a glance

```
sites ──┬── profiles (fk auth.users, role, site_id)
        ├── par_levels ─── sauces
        ├── prep_plans ─── prep_plan_items (suggested_bags, override_bags, reasoning jsonb)
        ├── prep_sessions ─┬─ prep_checklist (cooked_at, blast_chilled_at, vacuum_packed_at)
        │                  └─ bags (ONE ROW PER PHYSICAL BAG)
        ├── usage_logs
        └── alerts
app_settings (singleton: timezone, digest hour, recipients, forecast buffer & window)
```

`bags` is the heart of the system — one row per physical vacuum-sealed bag, carrying its own `sealed_expiry`, `opened_expiry` and status. A database trigger applies the shelf-life rules on every write, so they hold no matter which client does the writing.

---

## The forecast engine

Lives in [`src/lib/forecast/engine.ts`](src/lib/forecast/engine.ts). It is **not** machine learning — it's transparent, explainable analytics, and the UI shows its full working rather than presenting a number to trust blindly.

For each sauce at each site, when planning the next prep day:

1. Pull the last **28 days** (configurable) of usage logs.
2. **Burn rate** = total bags used ÷ days observed.
3. **Day-of-week multipliers** — "Fridays use ~40% more Ranch than an average day". Clamped to `[0.5, 2]` and only applied once there's enough data, so one freak Saturday can't double a batch.
4. Read **current usable stock** — sealed *and* opened bags both count.
5. Work out **days this batch must cover** (3 for Tuesday, 4 for Friday).
6. **Projected need** = Σ (burn rate × that day's multiplier) across the covered days.
7. **Suggested bags** = `max(0, ceil((projected need − usable stock) × 1.1))`, floored at the par gap where a manager has set a par level.
8. **Low-stock flag** = current stock < burn rate × days until the next prep day.

Every intermediate value is persisted to `prep_plan_items.reasoning` and rendered in the planner's reasoning drawer — burn rate, observed days, per-weekday multipliers, per-day projections, the buffer, whether the par floor kicked in, and plain-English notes.

### Edge cases handled explicitly

| Case | Behaviour |
| --- | --- |
| No usage history at all | Falls back to the par level, marked **low confidence** with "based on par level (not enough data)" |
| Logged but never used in the window | Same par fallback, low confidence |
| Sauce added mid-window | Divides by days since `introduced_on`, not the full 28 — and says so in the notes |
| Opened vs sealed stock | Both count toward usable stock; neither is double-counted |
| Timezone | Every "today" / "expiring today" / "next prep day" resolves through `APP_TIMEZONE` |

### Pattern detection

`detectWeekdaySpikes()` flags sauces that repeatedly spike on the same weekday, but **only after a full 4 weeks of data**. Below that, a "pattern" is usually noise, and a wrong pattern alert costs more trust than it's worth.

---

## Notifications and the daily digest

### In-app

The alerts centre (`/alerts`) aggregates three scan types, each carrying **three concrete suggested actions**:

- **Low stock** — emergency top-up · pull from the other site · increase the next batch. "Pull from the other site" is wired up and actually moves sealed bags.
- **Expiry** — one alert per site summarising everything amber and red.
- **Pattern** — repeated weekday spikes, raised weekly rather than daily.

Alerts are deduplicated by `dedupe_key` (unique index), so re-running a scan the same day is a no-op rather than a duplicate storm.

### Email (Resend)

Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (a verified sender), then add recipients in **Settings → App & alerts**. With no key configured the app logs a skip and carries on — a kitchen tool shouldn't break because the mail provider isn't set up yet.

### Scheduling the 8am digest

The business logic lives at `POST /api/cron/digest`, guarded by `CRON_SECRET`. The Supabase Edge Function in `supabase/functions/daily-digest` is a thin trigger for it.

```bash
supabase functions deploy daily-digest --no-verify-jwt
supabase secrets set APP_URL=https://your-app.vercel.app CRON_SECRET=<same value as .env>
```

Then schedule it (SQL editor, with `pg_cron` and `pg_net` enabled):

```sql
select cron.schedule(
  'peckers-daily-digest',
  '0 7 * * *',  -- 07:00 UTC = 08:00 British Summer Time
  $$ select net.http_post(
       url := 'https://<project-ref>.functions.supabase.co/daily-digest',
       headers := '{"Content-Type":"application/json"}'::jsonb
     ) $$
);
```

> **Winter note:** `pg_cron` runs in UTC and doesn't follow BST. `0 7 * * *` is 8am from late March to late October and 7am the rest of the year. If exact 8am year-round matters, either schedule both `0 7` and `0 8` and let the endpoint no-op outside `app_settings.digest_hour`, or move the schedule twice a year.

You can also fire the job by hand during setup:

```bash
curl -X POST http://localhost:3000/api/cron/digest -H "Authorization: Bearer $CRON_SECRET"
```

---

## Deploying

### Vercel (frontend)

1. Import the repo.
2. Add every variable from `.env.example` under **Settings → Environment Variables**.
3. Deploy. No custom build command is needed.

### Supabase (backend)

1. `supabase db push` against the production project.
2. Deploy the edge function and set its secrets (above).
3. Schedule the cron job.
4. Add your Vercel URL to **Authentication → URL Configuration → Site URL** and redirect URLs.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Both | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Both | Public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Seeding, digest, admin user management. Bypasses RLS — never expose it |
| `RESEND_API_KEY` | Server | Email delivery |
| `RESEND_FROM_EMAIL` | Server | Verified sender, e.g. `"Peckers SMS <sms@yourdomain.co.uk>"` |
| `NEXT_PUBLIC_APP_TIMEZONE` | Both | Business timezone. Default `Europe/London` |
| `NEXT_PUBLIC_APP_URL` | Server | Used for links inside emails |
| `CRON_SECRET` | Server + edge function | Shared bearer secret for the digest endpoint |

No secrets are hardcoded anywhere in the codebase.

---

## Project structure

```
src/
  app/
    (app)/                    Authenticated shell + every feature route
      dashboard/              Manager command centre
      today/                  Staff home — "what do I do right now?"
      planner/                Forecast, overrides, reasoning drawer
      prep/                   3-step checklist + blast-chill timer
      batches/                Batch history + prep-vs-plan
      usage/                  Daily usage logging + burn rate
      expiry/                 Expiry tracker (staff and manager views)
      alerts/                 Alerts centre with suggested actions
      overtime/               Hours worked + CSV export
      settings/               Sauces, par levels, staff, app config
    api/
      cron/digest/            Daily 8am digest endpoint
      export/overtime/        Payroll CSV
    gallery/                  Design system showcase (public)
    login/
  components/
    ui/                       The custom component library
    app/                      App shell, page header, status pills
    providers/                Theme + React Query + toasts
  lib/
    design/tokens.ts          THE source of truth for the visual language
    date.ts                   Timezone, prep-day and shelf-life rules
    forecast/engine.ts        The forecast engine (+ engine.test.ts)
    alerts/engine.ts          Low-stock, expiry and pattern scans
    queries/                  Server-side reads
    actions/                  Server actions (all mutations)
    email/                    Resend client + HTML templates
    supabase/                 Browser, server, admin and middleware clients
supabase/
  migrations/                 Schema, views, RLS, functions
  functions/daily-digest/     Scheduled Edge Function
  seed/seed.ts                Seed script
```

---

## Design system

Everything interactive is built from scratch — there is no component library in the dependency tree, and no native `<select>` or `<input type="date">` anywhere in the app.

Browse it at **`/gallery`** (works without signing in), in both light and dark mode.

- **Tokens** — colours, spacing, radii, type scale, shadows, z-index and motion all live in `src/lib/design/tokens.ts`. Tailwind's config imports that file and injects the semantic CSS variables, so `bg-surface` / `text-ink-muted` flip themes with no `dark:` variants in feature code. There are no hardcoded hex values in components.
- **Status palette** — Green = healthy (3+ days) · Amber = 1–2 days · Red = expiring today or expired. Colour is *never* the only signal: every status pill carries an icon or a dot plus words.
- **Components** — buttons, inputs, custom dropdown (full listbox keyboard semantics + typeahead + search), custom calendar and range picker, toggles, checkboxes, radio groups, steppers, modals, drawers, bottom sheets, toasts, tabs, segmented controls, tables, badges, progress bars and rings, the blast-chill countdown, tooltips, and skeleton loaders for every async view.
- **Tablet first** — primary actions are 44–52px tall, thumb-reachable, and the bottom sheet is swipe-dismissable.
- **Accessibility** — keyboard navigation throughout, focus trapping in overlays, roving tabindex in radio groups and tabs, ARIA roles on every custom control, and AA contrast on the status palette.
- **Empty states** — every list and table has a designed empty state with a helpful message and a next action.

---

## Testing

```bash
npm test
```

`src/lib/forecast/engine.test.ts` covers the engine and the date rules it depends on:

- Tuesday = 3-day cover, Friday = 4-day cover, and the days each batch actually spans
- Sealed expiry (prep + 5) and the opened-bag rule, including a bag opened on day 4 correctly capping at the sealed date
- Expiry colour bands — expired / today / 1–2 days / healthy
- Normal forecast: burn rate → projected need → minus stock → buffer → rounded
- No-history fallback to par level, marked low confidence
- New sauce introduced mid-window: divides by days since introduction, not 28
- Weekday spike detection, including staying silent with under 4 weeks of data
- Opened bags counted toward usable stock
- Par floor raising a small suggestion, but never lowering a large one
- Low-stock flag firing (and not firing) correctly

Run `npm run typecheck` and `npm run lint` alongside it — both are clean, and there is no `any` used to paper over types.
#   p e c k e r s - s m s  
 