'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button, Callout, Input } from '@/components/ui'
import { signIn } from '@/lib/actions/auth'
import { motion as motionTokens } from '@/lib/design/tokens'

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = await signIn(formData)
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong. Try again.')
        return
      }
      // A full refresh so the server layout picks up the new session cookie.
      router.replace(next && next.startsWith('/') ? next : '/')
      router.refresh()
    })
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: motionTokens.duration.slow, ease: motionTokens.ease.out }}
      onSubmit={onSubmit}
      className="mt-8 space-y-5"
      noValidate
    >
      <Input
        name="email"
        type="email"
        label="Email"
        autoComplete="username"
        leadingIcon="mail"
        placeholder="you@peckers.dev"
        required
        autoFocus
        size="lg"
      />

      <Input
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        leadingIcon="lock"
        placeholder="••••••••"
        required
        size="lg"
      />

      {error ? (
        <Callout tone="danger" icon="alert-triangle">
          {error}
        </Callout>
      ) : null}

      <Button type="submit" size="lg" fullWidth loading={pending} trailingIcon="arrow-right">
        Sign in
      </Button>

      <p className="pt-2 text-center text-xs leading-relaxed text-ink-subtle">
        Lost access? Ask your manager to reset it from Settings → Staff.
      </p>
    </motion.form>
  )
}
