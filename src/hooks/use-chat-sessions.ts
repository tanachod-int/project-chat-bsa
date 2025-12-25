"use client"

import { useState, useEffect } from 'react'
import { API_BASE_SESSION, buildApiUrl } from '@/constants/api'

export interface ChatSession {
  id: string
  title: string
  created_at: string
  message_count: number
}

export function useChatSessions(userId?: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = async () => {
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      const apiUrl = buildApiUrl(API_BASE_SESSION, { userId })
      const response = await fetch(apiUrl)

      if (!response.ok) {
        throw new Error('Failed to fetch sessions')
      }

      const data = await response.json()
      setSessions(data.sessions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const createSession = async (title?: string) => {
    if (!userId) return null

    setError(null)

    try {
      const response = await fetch(API_BASE_SESSION, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, userId }),
      })

      if (!response.ok) {
        throw new Error('Failed to create session')
      }

      const data = await response.json()
      const newSession = data.session

      setSessions(prev => [newSession, ...prev])

      return newSession
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    }
  }

  const updateSessionTitle = async (sessionId: string, title: string) => {
    setError(null)

    try {
      const response = await fetch(API_BASE_SESSION, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, title }),
      })

      if (!response.ok) {
        throw new Error('Failed to update session')
      }

      const data = await response.json()
      const updatedSession = data.session

      setSessions(prev => prev.map(session =>
        session.id === sessionId
          ? { ...session, title: updatedSession.title }
          : session
      ))

      return updatedSession
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    }
  }

  // ลบ session
  const deleteSession = async (sessionId: string) => {
    setError(null)

    try {
      const apiUrl = buildApiUrl(API_BASE_SESSION, { sessionId })
      const response = await fetch(apiUrl, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete session')
      }

      // ลบ session จากรายการ
      setSessions(prev => prev.filter(session => session.id !== sessionId))

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return false
    }
  }

  // ดึงข้อมูลเมื่อมี userId
  useEffect(() => {
    if (userId) {
      fetchSessions()
    }
  }, [userId])

  return {
    sessions,
    loading,
    error,
    fetchSessions,
    createSession,
    updateSessionTitle,
    deleteSession,
  }
}