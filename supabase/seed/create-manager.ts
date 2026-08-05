/**
 * Creates one real manager account. This is how you get your first working
 * login in production — never a hardcoded/demo credential.
 *
 * Reads from the environment so the password never has to be typed into a
 * terminal history or committed anywhere:
 *
 *   MANAGER_EMAIL=you@peckers.co.uk MANAGER_NAME="Rishi Patel" MANAGER_PASSWORD='...' npm run db:create-manager
 *
 * The password must satisfy Supabase's minimum (8+ characters). Change it
 * on first sign-in if you'd rather not have it living in shell history —
 * or unset your shell history for this command.
 *
 * Safe to run again with a different MANAGER_EMAIL to add more managers.
 * Re-running with the same email updates that person's name/role/password
 * rather than failing.
 */

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`\n  Missing ${name}.\n`)
    process.exit(1)
  }
  return value
}

async function main(): Promise<void> {
  const email = requireEnv('MANAGER_EMAIL').trim().toLowerCase()
  const fullName = requireEnv('MANAGER_NAME').trim()
  const password = requireEnv('MANAGER_PASSWORD')

  if (password.length < 8) {
    console.error('\n  MANAGER_PASSWORD must be at least 8 characters.\n')
    process.exit(1)
  }

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  console.log(`\nCreating manager account for ${email}\n`)

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'manager', site_id: null },
  })

  let userId = created?.user?.id

  if (createError) {
    if (!/already/i.test(createError.message)) {
      throw new Error(`Creating ${email}: ${createError.message}`)
    }
    // Already exists — update them in place rather than failing.
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = list?.users.find((candidate) => candidate.email === email)
    if (!existing) throw new Error(`Could not resolve existing user ${email}`)
    userId = existing.id
    await supabase.auth.admin.updateUserById(existing.id, { password })
    console.log('  · account already existed — password updated')
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    { id: userId!, email, full_name: fullName, role: 'manager', site_id: null, active: true },
    { onConflict: 'id' },
  )
  if (profileError) throw new Error(`Profile: ${profileError.message}`)

  console.log(`  · ${fullName} <${email}> is now a manager\n`)
  console.log('Done. Sign in at your app URL with the email and password you set above.\n')
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error, '\n')
  process.exit(1)
})
