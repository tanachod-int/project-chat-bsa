import { NextResponse } from 'next/server'

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    public readonly publicMessage: string
  ) {
    super(publicMessage)
    this.name = 'ApiError'
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message)
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'You do not have permission to access this resource') {
    super(403, 'FORBIDDEN', message)
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message)
  }
}

export function jsonError(message: string, statusCode: number, code = 'ERROR') {
  return NextResponse.json(
    { error: { code, message } },
    { status: statusCode }
  )
}

export function handleApiError(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError) {
    return jsonError(error.publicMessage, error.statusCode, error.code)
  }

  console.error(fallbackMessage)
  return jsonError(fallbackMessage, 500, 'INTERNAL_ERROR')
}
