'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

export interface ActionResult {
  ok: boolean
  error?: string
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { ok: false, error: 'Enter your email and password.' }
  }

  const supabase = createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Deliberately vague — never confirm whether an address exists.
    return { ok: false, error: 'Those details did not match an account.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function signOut(): Promise<void> {
  const supabase = createServerSupabase()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
