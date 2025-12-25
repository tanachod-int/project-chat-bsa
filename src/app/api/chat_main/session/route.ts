import { NextRequest, NextResponse } from "next/server"
import { getDatabase } from '@/lib/database'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const pool = getDatabase()
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const sessionId = searchParams.get('sessionId')
    
    const client = await pool.connect()
    
    try {
      if (sessionId) {
        // ดึงข้อมูล เมื่อมี sessionId
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
            chat_messages cm ON cm.session_id = cs.id::text
          WHERE 
            cs.id = $1
          GROUP BY 
            cs.id
        `, [sessionId])

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: "Session not found" },
            { status: 404 }
          )
        }
        return NextResponse.json({
          session: result.rows[0]
        })
      }

      if (!userId) {
        return Response.json({ error: 'User ID is required' }, { status: 400 })
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
          chat_messages cm ON cm.session_id = cs.id::text
        WHERE 
          cs.user_id = $1
        GROUP BY 
          cs.id
        ORDER BY 
          cs.created_at DESC 
        LIMIT 50
      `, [userId])

      return NextResponse.json({
        sessions: result.rows
      })

    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error fetching chat sessions:", error)
    return NextResponse.json(
      { error: "Failed to fetch chat sessions" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const pool = getDatabase()
  try {
    const { title, userId } = await req.json()
    
    if (!userId) {
      return Response.json({ error: 'User ID is required' }, { status: 400 })
    }
    
    const client = await pool.connect()
    
    try {
      const result = await client.query(`
        INSERT INTO chat_sessions (title, user_id)
        VALUES ($1, $2)
        RETURNING id, title, created_at
      `, [title || 'New Chat', userId])

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
    console.error("Error creating chat session:", error)
    return NextResponse.json(
      { error: "Failed to create chat session" },
      { status: 500 }
    )
  }
}

//อัปเดตชื่อ session
export async function PUT(req: NextRequest) {
  const pool = getDatabase()
  try {
    const { sessionId, title } = await req.json()
    
    if (!sessionId || !title) {
      return NextResponse.json(
        { error: "Session ID and title are required" },
        { status: 400 }
      )
    }

    const client = await pool.connect()
    
    try {
      const result = await client.query(`
        UPDATE chat_sessions 
        SET title = $1 
        WHERE id = $2
        RETURNING id, title, created_at
      `, [title, sessionId])

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        )
      }

      return NextResponse.json({
        session: result.rows[0]
      })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error updating chat session:", error)
    return NextResponse.json(
      { error: "Failed to update chat session" },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const pool = getDatabase()
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      )
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      
      await client.query(`
        DELETE FROM chat_messages 
        WHERE session_id = $1
      `, [sessionId])
      
      const result = await client.query(`
        DELETE FROM chat_sessions 
        WHERE id = $1
        RETURNING id
      `, [sessionId])
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        )
      }
      
      await client.query('COMMIT')

      return NextResponse.json({
        message: "🗑️ ลบเซสชั่นสำเร็จแล้ว",
        sessionId: sessionId
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error deleting chat session:", error)
    return NextResponse.json(
      { error: "Failed to delete chat session" },
      { status: 500 }
    )
  }
}