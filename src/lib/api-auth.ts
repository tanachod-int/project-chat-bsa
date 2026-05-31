import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/server'
import { UnauthorizedError, ForbiddenError } from '@/lib/api-errors'

export async function requireAuthenticatedUser(): Promise<User> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new UnauthorizedError()
  }

  return user
}

export function hasValidEvalSecret(request: Request): boolean {
  const configuredSecret = process.env.EVAL_SECRET_KEY

  return (
    process.env.NODE_ENV !== 'production' &&
    Boolean(configuredSecret) &&
    request.headers.get('x-eval-secret') === configuredSecret
  )
}

export function requireEvalAccess(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    throw new ForbiddenError('Evaluation mode is disabled in production')
  }

  if (!process.env.EVAL_SECRET_KEY) {
    throw new ForbiddenError('Evaluation mode is not configured')
  }

  if (!hasValidEvalSecret(request)) {
    throw new UnauthorizedError('Evaluation secret required')
  }
}
