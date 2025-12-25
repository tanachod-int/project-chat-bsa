import { createClient } from "@/lib/server"
import { redirect } from "next/navigation"
import { ChatHistory } from "@/components/chat-history"
import { getDatabase } from '@/lib/database'

const pool = getDatabase()
interface ChatPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function HistoryChatPage({ params }: ChatPageProps) {

  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  let chatTitle = "Chat Conversation"
  let sessionExists = false

  try {
    const client = await pool.connect()
    try {
      const result = await client.query(`
        SELECT id, title, created_at, user_id                                                           
        FROM chat_sessions 
        WHERE id = $1 AND user_id = $2
      `, [id, user.id])

      if (result.rows.length > 0) {
        chatTitle = result.rows[0].title || "Chat Conversation"
        sessionExists = true
      }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Error fetching chat session:', error)
  }

  if (!sessionExists && id !== 'new') {
    redirect('/chat')
  }

  return <ChatHistory sessionId={id} title={chatTitle} userId={user.id} />
}