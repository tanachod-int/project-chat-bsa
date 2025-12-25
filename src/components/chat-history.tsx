"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/ui/chat-container"
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ui/message"
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input"
import { ScrollButton } from "@/components/ui/scroll-button"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useChatHistory } from "@/hooks/use-chat-history"
import {
  ArrowUp,
  Check,
  Copy,
  Square,
  Lock,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ========================
// Helper: ฟังก์ชั่นช่วย Scroll
// ========================
const isNearBottom = (element: HTMLDivElement) => {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 100
}

interface ChatHistoryProps {
  sessionId: string
  title: string
  userId?: string
}

export function ChatHistory({ sessionId, title, userId }: ChatHistoryProps) {
  const [copiedMessages, setCopiedMessages] = useState<Record<string, boolean>>({})
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const loadedSessionRef = useRef<string | null>(null)
  const [mounted, setMounted] = useState(true)

  const {
    messages,
    loading,
    input,
    setInput,
    sendMessage,
    stopMessage,
    loadChatHistory,
    loadingHistory,
    historyError,
  } = useChatHistory(sessionId, userId)

  // ========================
  // โหลดประวัติแชท
  // ========================
  useEffect(() => {
    if (!sessionId || sessionId === 'new') return

    if (loadedSessionRef.current === sessionId) return

    loadedSessionRef.current = sessionId
    setMounted(true)

    loadChatHistory(sessionId)

    return () => {
      setMounted(false)
    }
  }, [sessionId, loadChatHistory])

  // ========================
  // Auto-scroll อัตโนมัติ
  // ========================
  useEffect(() => {
    if (messages.length > 0 && chatContainerRef.current && mounted) {
      const shouldScroll = isNearBottom(chatContainerRef.current) || loading
      if (shouldScroll) {
        requestAnimationFrame(() => {
          chatContainerRef.current?.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth'
          })
        })
      }
    }
  }, [messages.length, loading, mounted])

  // ========================
  // ฟังก์ชั่นจัดการ Event
  // ========================
  const handleCopyMessage = useCallback(async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessages(prev => ({ ...prev, [messageId]: true }))
      setTimeout(() => {
        setCopiedMessages(prev => ({ ...prev, [messageId]: false }))
      }, 2000)
    } catch (error) {
      console.error('Failed to copy message:', error)
    }
  }, [])

  const onSubmit = useCallback(() => {
    if (!input.trim() || loading || !userId) return
    sendMessage(input)
  }, [input, loading, userId, sendMessage])

  const handleStop = useCallback(() => {
    stopMessage()
  }, [stopMessage])

  // ========================
  // Header Component
  // ========================
  const Header = () => (
    <header className="bg-background/80 backdrop-blur-md z-10 flex h-14 w-full shrink-0 items-center gap-2 border-b px-4 sticky top-0">
      <SidebarTrigger className="-ml-1" />
      <div className="text-foreground font-medium truncate flex-1">{title}</div>
    </header>
  )

  // ========================
  // แสดงผล: ยังไม่ได้เข้าสู่ระบบ
  // ========================
  if (!userId) {
    return (
      <main className="flex h-screen flex-col overflow-hidden">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm">
            <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <Lock className="text-red-500 h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">กรุณาเข้าสู่ระบบ</h2>
            <p className="text-muted-foreground mb-6">คุณจำเป็นต้องเข้าสู่ระบบเพื่อดูประวัติการสนทนาและใช้งานแชทบอท</p>
            <Button asChild className="w-full">
              <Link href="/auth/login">เข้าสู่ระบบ</Link>
            </Button>
          </div>
        </div>
      </main>
    )
  }

  // ========================
  // แสดงผล: UI หลัก
  // ========================
  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <Header />

      <div ref={chatContainerRef} className="relative flex-1 overflow-hidden">
        <ChatContainerRoot className="h-full">
          <ChatContainerContent className="p-4">

            {/* สถานะกำลังโหลด */}
            {loadingHistory && (
              <div className="flex flex-col justify-center items-center py-12 h-full">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
                <p className="text-muted-foreground animate-pulse">กำลังโหลดประวัติการสนทนา...</p>
              </div>
            )}

            {/* สถานะเกิดข้อผิดพลาด */}
            {historyError && (
              <div className="flex flex-col justify-center items-center py-12 h-full text-center">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <AlertTriangle className="text-destructive h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-destructive mb-2">เกิดข้อผิดพลาด</h3>
                <p className="text-muted-foreground text-sm mb-4 max-w-xs">{historyError}</p>
                <Button
                  onClick={() => {
                    loadedSessionRef.current = null
                    loadChatHistory(sessionId)
                  }}
                  variant="outline"
                  size="sm"
                >
                  ลองใหม่อีกครั้ง
                </Button>
              </div>
            )}

            {/* สถานะไม่มีข้อมูล */}
            {!loadingHistory && !historyError && messages.length === 0 && (
              <div className="flex flex-col justify-center items-center py-12 h-full text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  เริ่มต้นการสนทนาใหม่
                </h3>
                <p className="text-muted-foreground mb-4 max-w-md">
                  พิมพ์คำถามด้านล่างเพื่อเริ่มปรึกษาอาการ หรือสอบถามอาการป่วยพื้นฐานได้เลยครับ
                </p>
              </div>
            )}

            {/* รายการข้อความ */}
            {!loadingHistory && !historyError && (
              <div className="space-y-4 max-w-3xl mx-auto w-full pb-4">
                {messages.map((message) => {
                  const isAssistant = message.role === "assistant"
                  return (
                    <Message key={message.id} isAssistant={isAssistant} bubbleStyle={true}>
                      <MessageContent isAssistant={isAssistant} bubbleStyle={true} markdown={isAssistant}>
                        {message.content}
                      </MessageContent>
                      <MessageActions isAssistant={isAssistant} bubbleStyle={true}>
                        <MessageAction tooltip="Copy" bubbleStyle={true}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleCopyMessage(message.content, message.id)}
                          >
                            {copiedMessages[message.id] ? (
                              <Check size={14} className="text-green-500" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </Button>
                        </MessageAction>
                      </MessageActions>
                    </Message>
                  )
                })}
              </div>
            )}

          </ChatContainerContent>

          {messages.length > 0 && (
            <div className="absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-end px-5 pointer-events-none">
              <div className="pointer-events-auto">
                <ScrollButton className="shadow-md bg-background/80 backdrop-blur-sm hover:bg-background" />
              </div>
            </div>
          )}
        </ChatContainerRoot>
      </div>

      <div className="bg-background/80 backdrop-blur-md z-20 shrink-0 px-4 pb-4 pt-2 border-t">
        <div className="mx-auto max-w-3xl">
          {loading && (
            <div className="text-gray-500 italic mb-2 text-sm pl-2">กำลังวิเคราะห์อาการ...</div>
          )}

          <PromptInput
            isLoading={loading}
            value={input}
            onValueChange={setInput}
            onSubmit={onSubmit}
            className="relative z-10 w-full rounded-[2rem] border border-input bg-card/50 shadow-xl shadow-primary/5 backdrop-blur-xl transition-all duration-200 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50"
          >
            <div className="relative flex items-end p-1">
              <PromptInputTextarea
                disabled={loading}
                placeholder={loading ? "กำลังประมวลผล..." : "พิมพ์อาการหรือคำถามของคุณที่นี่..."}
                className="min-h-[52px] py-4 pl-5 pr-14 text-base leading-[1.6] bg-transparent focus:outline-none resize-none placeholder:text-muted-foreground/50"
              />

              <PromptInputActions className="absolute bottom-2.5 right-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    disabled={(!loading && (!input.trim() || !userId))}
                    onClick={loading ? handleStop : onSubmit}
                    className={cn(
                      "size-10 rounded-full transition-all duration-200 shadow-md",
                      !loading
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 hover:shadow-primary/25"
                        : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    )}
                  >
                    {loading ? (
                      <Square size={18} fill="currentColor" />
                    ) : (
                      <ArrowUp size={20} strokeWidth={2.5} />
                    )}
                  </Button>
                </div>
              </PromptInputActions>
            </div>
          </PromptInput>

          <p className="text-xs text-center text-muted-foreground mt-3 opacity-60">
            ChatBSA อาจให้ข้อมูลที่คลาดเคลื่อน โปรดตรวจสอบข้อมูลสำคัญ
          </p>
          <p className="text-xs text-center text-muted-foreground mt-1 opacity-50">
            © 2025 ChatBSA. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  )
}