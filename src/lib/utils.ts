import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateUniqueId(prefix: string = ''): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9)
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`
}

export interface GroupedSessions {
  period: string
  sessions: ChatSession[]
}

interface ChatSession {
  id: string
  title: string
  created_at: string
  message_count?: number
  user_id?: string
}

export function groupSessionsByDate(sessions: ChatSession[]): GroupedSessions[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  const groups: { [key: string]: ChatSession[] } = {
    today: [],
    yesterday: [],
    last7days: [],
    lastMonth: [],
    older: []
  }

  sessions.forEach(session => {
    const sessionDate = new Date(session.created_at)
    const sessionDateOnly = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate())

    if (sessionDateOnly.getTime() === today.getTime()) {
      groups.today.push(session)
    } else if (sessionDateOnly.getTime() === yesterday.getTime()) {
      groups.yesterday.push(session)
    } else if (sessionDate >= sevenDaysAgo) {
      groups.last7days.push(session)
    } else if (sessionDate >= thirtyDaysAgo) {
      groups.lastMonth.push(session)
    } else {
      groups.older.push(session)
    }
  })

  const result: GroupedSessions[] = []

  if (groups.today.length > 0) {
    result.push({ period: 'Today', sessions: groups.today })
  }

  if (groups.yesterday.length > 0) {
    result.push({ period: 'Yesterday', sessions: groups.yesterday })
  }

  if (groups.last7days.length > 0) {
    result.push({ period: 'Last 7 days', sessions: groups.last7days })
  }

  if (groups.lastMonth.length > 0) {
    result.push({ period: 'Last month', sessions: groups.lastMonth })
  }

  if (groups.older.length > 0) {
    result.push({ period: 'Older', sessions: groups.older })
  }

  return result
}