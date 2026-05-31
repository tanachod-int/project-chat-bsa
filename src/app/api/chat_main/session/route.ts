import { NextRequest, NextResponse } from "next/server"

import { requireAuthenticatedUser } from '@/lib/api-auth'
import { handleApiError, jsonError } from '@/lib/api-errors'
import { getDatabase } from '@/lib/database'
import { ChatHistoryService } from '@/services/chat-history'

export const dynamic = 'force-dynamic'

function normalizeTitle(title: unknown) {
  if (typeof title !== 'string') return 'New Chat'

  const trimmedTitle = title.trim()
  return trimmedTitle ? trimmedTitle.slice(0, 255) : 'New Chat'
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser()
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    const pool = getDatabase()
    const client = await pool.connect()

    try {
      if (sessionId) {
        await ChatHistoryService.assertSessionOwner(sessionId, user.id, client)

        const result = await client.query(`
          SELECT
            cs.id,
            cs.title,
            cs.created_at,
            cs.user_id,
            COUNT(cm.id) as message_count
          FROM
            chat_sessions cs
          LEFT JOIN
            chat_messages cm ON cm.session_id = cs.id
          WHERE
            cs.id = $1 AND cs.user_id = $2
          GROUP BY
            cs.id
        `, [sessionId, user.id])

        return NextResponse.json({
          session: result.rows[0]
        })
      }

      const result = await client.query(`
        SELECT
          cs.id,
          cs.title,
          cs.created_at,
          cs.user_id,
          COUNT(cm.id) as message_count
        FROM
          chat_sessions cs
        LEFT JOIN
          chat_messages cm ON cm.session_id = cs.id
        WHERE
          cs.user_id = $1
        GROUP BY
          cs.id
        ORDER BY
          cs.created_at DESC
        LIMIT 50
      `, [user.id])

      return NextResponse.json({
        sessions: result.rows
      })
    } finally {
      client.release()
    }
  } catch (error) {
    return handleApiError(error, "Failed to fetch chat sessions")
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser()
    const { title } = await req.json()
    const pool = getDatabase()
    const client = await pool.connect()

    try {
      const result = await client.query(`
        INSERT INTO chat_sessions (title, user_id)
        VALUES ($1, $2)
        RETURNING id, title, created_at
      `, [normalizeTitle(title), user.id])

      const newSession = result.rows[0]

      return NextResponse.json({
        session: {
          id: newSession.id,
          title: newSession.title,
          created_at: newSession.created_at,
          message_count: 0
        }
      })
    } finally {
      client.release()
    }
  } catch (error) {
    return handleApiError(error, "Failed to create chat session")
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser()
    const { sessionId, title } = await req.json()

    if (!sessionId || typeof title !== 'string' || !title.trim()) {
      return jsonError("Session ID and title are required", 400, 'INVALID_INPUT')
    }

    const pool = getDatabase()
    const client = await pool.connect()

    try {
      await ChatHistoryService.assertSessionOwner(sessionId, user.id, client)

      const result = await client.query(`
        UPDATE chat_sessions
        SET title = $1
        WHERE id = $2 AND user_id = $3
        RETURNING id, title, created_at
      `, [normalizeTitle(title), sessionId, user.id])

      return NextResponse.json({
        session: result.rows[0]
      })
    } finally {
      client.release()
    }
  } catch (error) {
    return handleApiError(error, "Failed to update chat session")
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser()
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return jsonError("Session ID is required", 400, 'INVALID_INPUT')
    }

    const pool = getDatabase()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await ChatHistoryService.assertSessionOwner(sessionId, user.id, client)

      await client.query(`
        DELETE FROM chat_messages
        WHERE session_id = $1
      `, [sessionId])

      const result = await client.query(`
        DELETE FROM chat_sessions
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `, [sessionId, user.id])

      if (result.rows.length === 0) {
        throw new Error('Session delete failed')
      }

      await client.query('COMMIT')

      return NextResponse.json({
        message: "Session deleted successfully",
        sessionId
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    return handleApiError(error, "Failed to delete chat session")
  }
}
