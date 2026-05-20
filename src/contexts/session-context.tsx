"use client"

import React, { createContext, useContext } from 'react'
import { useChatSessions, ChatSession } from '@/hooks/use-chat-sessions'

interface SessionContextType {
  sessions: ChatSession[]
  loading: boolean
  error: string | null
  fetchSessions: () => Promise<void>
  createSession: (title?: string) => Promise<ChatSession | null>
  updateSessionTitle: (sessionId: string, title: string) => Promise<ChatSession | null>
  deleteSession: (sessionId: string) => Promise<boolean>
}

const SessionContext = createContext<SessionContextType | undefined>(undefined)

export function SessionProvider({ userId, children }: { userId: string, children: React.ReactNode }) {
  const sessionData = useChatSessions(userId)

  return (
    <SessionContext.Provider value={sessionData}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSessionContext() {
  const context = useContext(SessionContext)
  if (context === undefined) {
    throw new Error('useSessionContext must be used within a SessionProvider')
  }
  return context
}