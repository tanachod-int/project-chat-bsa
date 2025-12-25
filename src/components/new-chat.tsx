"use client"

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
import { cn } from "@/lib/utils"
import {
  ArrowUp,
  Check,
  Copy,
  Square,
  Sparkles,
  MessageSquarePlus,
  Stethoscope,
  AlertCircle
} from "lucide-react"
import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback
} from "react"
import { useChatContext } from "@/contexts/chat-context"
import { useChat } from '@ai-sdk/react'
import { createCustomChatTransport } from '@/lib/custom-chat-transport'
import { createClient } from '@/lib/client'
import { API_BASE, buildApiUrl } from "@/constants/api"
import { useSessionContext } from "@/contexts/session-context"

// ========================
// ประเภทข้อมูล
// ========================

interface MessageType {
  id: string;
  role: string;
  parts: Array<{ type: string; text: string }>;
}

interface SamplePrompt {
  title: string;
  prompt: string;
  icon: string;
  color: string;
}

const samplePrompts: SamplePrompt[] = [
  {
    title: 'อาการปวดหัว',
    prompt: 'ฉันมีอาการปวดหัว',
    icon: '🤕',
    color: 'bg-orange-100 text-orange-600'
  },
  {
    title: 'ปวดท้อง',
    prompt: 'ฉันมีอาการปวดท้อง',
    icon: '😣',
    color: 'bg-red-100 text-red-600'
  },
  {
    title: 'เวียนหัว',
    prompt: 'รู้สึกหน้ามืดเวลาลุกเดินกะทันหัน',
    icon: '🌀',
    color: 'bg-purple-100 text-purple-600'
  },
  {
    title: 'ไอเรื้อรัง',
    prompt: 'มีอาการไอแห้งๆ มานานกว่า 1 สัปดาห์',
    icon: '🤧',
    color: 'bg-blue-100 text-blue-600'
  },
  {
    title: 'ปวดหลัง',
    prompt: 'ฉันมีอาการปวดหลังแปล๊บๆ',
    icon: '😫',
    color: 'bg-yellow-100 text-yellow-600'
  },
  {
    title: 'มีน้ำมูก',
    prompt: 'ฉันมีอาการน้ำมูกไหลมา 2 วันแล้ว',
    icon: '🔬',
    color: 'bg-green-100 text-green-600'
  }
]

// ========================
// Helper: ฟังก์ชั่นช่วย Scroll
// ========================
const isNearBottom = (element: HTMLDivElement) => {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 100
}

// ========================
// Component หลัก
// ========================
export function NewChat() {
  const [prompt, setPrompt] = useState("")
  const { showWelcome, setShowWelcome } = useChatContext()
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [copiedMessages, setCopiedMessages] = useState<Record<string, boolean>>({})
  const [userId, setUserId] = useState<string>('')
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const [loadedMessages, setLoadedMessages] = useState<MessageType[]>([])
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null) // ✅ เพิ่ม error state
  const { fetchSessions } = useSessionContext()

  // ========================
  // ฟังก์ชั่นช่วย (Memoized)
  // ========================
  const getMessageContent = useCallback((message: any) => {
    return typeof message === 'object' && 'parts' in message && message.parts
      ? message.parts.map((part: any) => 'text' in part ? part.text : '').join('')
      : String(message)
  }, [])

  const loadChatHistory = useCallback(async (sessionIdToLoad: string, signal: AbortSignal) => {
    if (!sessionIdToLoad) return
    setLoadError(null) // ✅ Reset error

    try {
      const apiUrl = buildApiUrl(API_BASE, { sessionId: sessionIdToLoad })
      const response = await fetch(apiUrl, { signal })
      if (!response.ok) throw new Error('Failed to load chat history')

      const data = await response.json()
      if (signal.aborted) return

      const loadedMessagesData = data.messages || []
      const formattedMessages = loadedMessagesData.map((msg: any, index: number) => ({
        id: msg.id || `loaded-${index}`,
        role: msg.role || 'user',
        parts: [{ type: 'text', text: msg.content || msg.text || '' }]
      }))

      setLoadedMessages(formattedMessages)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error loading chat history:', error)
        setLoadError('ไม่สามารถโหลดประวัติการสนทนาได้')
        setLoadedMessages([])
      }
    }
  }, [])

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    transport: createCustomChatTransport({
      api: API_BASE,
      onResponse: (response: Response) => {
        const newSessionId = response.headers.get('x-session-id')
        if (newSessionId) {
          const wasNewSessionCreated = !sessionId
          setSessionId(newSessionId)
          localStorage.setItem('currentSessionId', newSessionId)
          if (wasNewSessionCreated) {
            fetchSessions()
          }
        }
      },
    }),
  })

  // ========================
  // คำนวณค่า (Memoized)
  // ========================
  const uniqueMessages = useMemo(() => {
    if (!sessionId || loadedMessages.length === 0) {
      return messages
    }

    const allMessages = [...loadedMessages, ...messages]
    const unique = []
    const seenContent = new Set()

    for (const message of allMessages) {
      const content = getMessageContent(message)
      const key = `${message.role}-${content}`
      if (!seenContent.has(key)) {
        seenContent.add(key)
        unique.push(message)
      }
    }

    return unique
  }, [messages, loadedMessages, sessionId, getMessageContent])

  // ========================
  // Effects
  // ========================
  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (mounted && user) {
        setUserId(user.id)
        const savedSessionId = localStorage.getItem('currentSessionId')
        if (savedSessionId && showWelcome) {
          setSessionId(savedSessionId)
          setShowWelcome(false)
        }
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        setUserId(session?.user?.id || '')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [setShowWelcome, showWelcome])

  useEffect(() => {
    if (showWelcome) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [showWelcome])

  useEffect(() => {
    if (showWelcome) {
      setSessionId(undefined)
      setMessages([])
      setLoadedMessages([])
      setHasLoadedHistory(false)
      setLoadError(null) // ✅ Reset error
    }
  }, [showWelcome, setMessages])

  useEffect(() => {
    if (sessionId && userId && !showWelcome && !hasLoadedHistory) {
      const controller = new AbortController()
      setHasLoadedHistory(true)
      loadChatHistory(sessionId, controller.signal)
      return () => controller.abort()
    }
  }, [sessionId, userId, showWelcome, hasLoadedHistory, loadChatHistory])

  useEffect(() => {
    if (uniqueMessages.length > 0 && chatContainerRef.current) {
      const shouldScroll = isNearBottom(chatContainerRef.current) ||
        status === 'streaming' ||
        status === 'submitted'

      if (shouldScroll) {
        requestAnimationFrame(() => {
          chatContainerRef.current?.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth'
          })
        })
      }
    }
  }, [uniqueMessages.length, status])

  // ========================
  // ฟังก์ชั่นจัดการ Event
  // ========================
  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || !userId) return

    sendMessage({
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: prompt.trim() }],
    }, {
      body: { userId, sessionId },
    })

    setPrompt("")
    setShowWelcome(false)
  }, [prompt, userId, sessionId, sendMessage, setShowWelcome])

  const handleSamplePrompt = useCallback((samplePrompt: string) => {
    setPrompt(samplePrompt)
    textareaRef.current?.focus()
  }, [])

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

  const handleRetryLoad = useCallback(() => {
    if (sessionId) {
      setHasLoadedHistory(false)
      setLoadError(null)
    }
  }, [sessionId])

  // ========================
  // สถานะ UI
  // ========================
  const isLoading = status === 'submitted' || status === 'streaming'
  const showEmptyState = showWelcome && messages.length === 0 && loadedMessages.length === 0

  // ========================
  // แสดงผล: ยังไม่ได้เข้าสู่ระบบ
  // ========================
  if (!userId) {
    return (
      <main className="flex h-screen flex-col overflow-hidden bg-background">
        <header className="bg-background/80 backdrop-blur-md z-10 flex h-16 w-full shrink-0 items-center gap-2 border-b px-4 sticky top-0">
          <SidebarTrigger className="-ml-1" />
          <div className="text-foreground flex-1 font-semibold">New Chat</div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 rounded-2xl bg-card shadow-lg border border-border/50 max-w-md mx-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Stethoscope className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">กรุณาเข้าสู่ระบบ</h2>
            <p className="text-muted-foreground">คุณต้องเข้าสู่ระบบก่อนเพื่อใช้งาน ChatBSA</p>
          </div>
        </div>
      </main>
    )
  }

  // ========================
  // แสดงผล: UI หลัก
  // ========================
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="bg-background/80 backdrop-blur-md z-10 flex h-16 w-full shrink-0 items-center gap-2 border-b px-4 sticky top-0">
        <SidebarTrigger className="-ml-1" />
        <div className="text-foreground flex-1 font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          {sessionId ? 'Chat Conversation' : 'New Chat'}
        </div>
      </header>

      <div ref={chatContainerRef} className="relative flex-1 overflow-hidden">
        <ChatContainerRoot className="h-full">
          <ChatContainerContent
            className={cn(
              "p-4 md:p-6",
              showEmptyState ? "flex items-center justify-center h-full" : ""
            )}
          >
            {/* สถานะเกิดข้อผิดพลาด */}
            {loadError && (
              <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-3 max-w-3xl mx-auto">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-destructive font-medium">{loadError}</p>
                  <Button
                    onClick={handleRetryLoad}
                    variant="outline"
                    size="sm"
                    className="mt-2 h-8"
                  >
                    ลองใหม่อีกครั้ง
                  </Button>
                </div>
              </div>
            )}

            {showEmptyState ? (
              <div className="text-center max-w-4xl mx-auto w-full animate-fade-in-up">
                <div className="mb-12">
                  <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">
                    Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">ChatBSA</span>
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                    ผู้ช่วยวิเคราะห์และให้คำแนะนำอาการป่วยพื้นฐาน
                    <br className="hidden md:block" />
                    <span className="text-sm opacity-80">(ข้อมูลนี้ใช้เพื่อการศึกษาเบื้องต้นเท่านั้น ไม่สามารถทดแทนคำวินิจฉัยจากแพทย์)</span>
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-4">
                  {samplePrompts.map((sample) => (
                    <button
                      key={sample.title}
                      onClick={() => handleSamplePrompt(sample.prompt)}
                      className="group relative bg-card hover:bg-accent/50 border border-border/50 hover:border-primary/30 rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                    >
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110", sample.color)}>
                        <span className="text-xl">{sample.icon}</span>
                      </div>
                      <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{sample.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{sample.prompt}</p>
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MessageSquarePlus className="w-4 h-4 text-primary" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 max-w-3xl mx-auto w-full pb-4">
                {uniqueMessages.map((message) => {
                  const isAssistant = message.role === "assistant"
                  const messageContent = getMessageContent(message)

                  return (
                    <Message
                      key={message.id}
                      isAssistant={isAssistant}
                      bubbleStyle={true}
                    >
                      <MessageContent
                        isAssistant={isAssistant}
                        bubbleStyle={true}
                        markdown={isAssistant}
                      >
                        {messageContent}
                      </MessageContent>

                      <MessageActions isAssistant={isAssistant} bubbleStyle={true}>
                        <MessageAction tooltip="Copy" bubbleStyle={true}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-full"
                            onClick={() => handleCopyMessage(messageContent, message.id)}
                          >
                            {copiedMessages[message.id] ? (
                              <Check size={14} className="text-green-600" />
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

          {!showEmptyState && (
            <div className="absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-end px-5 pointer-events-none">
              <ScrollButton className="shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 pointer-events-auto" />
            </div>
          )}
        </ChatContainerRoot>
      </div>

      <div className="bg-background/80 backdrop-blur-md z-20 px-4 pb-4 pt-2">
        <div className="mx-auto max-w-3xl">
          {isLoading && (
            <div className="flex items-center justify-center gap-3 text-primary mb-4 animate-fade-in-up">
              <div className="relative flex h-8 w-8 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/20 opacity-75"></span>
                <div className="relative inline-flex rounded-full h-8 w-8 bg-primary/10 items-center justify-center">
                  <Stethoscope className="w-4 h-4 text-primary animate-pulse" />
                </div>
              </div>
              <span className="text-sm font-medium bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600 animate-pulse">
                กำลังวิเคราะห์อาการ...
              </span>
            </div>
          )}

          <PromptInput
            isLoading={status !== 'ready'}
            value={prompt}
            onValueChange={setPrompt}
            onSubmit={handleSubmit}
            className="relative z-10 w-full rounded-[2rem] border border-input bg-card/50 shadow-xl shadow-primary/5 backdrop-blur-xl transition-all duration-200 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50"
          >
            <div className="relative flex items-end p-1">
              <PromptInputTextarea
                ref={textareaRef}
                placeholder="พิมพ์อาการของคุณที่นี่..."
                className="min-h-[52px] py-4 pl-5 pr-14 text-base leading-[1.6] bg-transparent focus:outline-none resize-none placeholder:text-muted-foreground/50"
              />

              <PromptInputActions className="absolute bottom-2.5 right-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    disabled={
                      (status === 'ready' && (!prompt.trim() || !userId)) ||
                      (status !== 'ready' && status !== 'streaming' && status !== 'submitted')
                    }
                    onClick={status === 'ready' ? handleSubmit : stop}
                    className={cn(
                      "size-10 rounded-full transition-all duration-200 shadow-md",
                      status === 'ready'
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 hover:shadow-primary/25"
                        : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    )}
                  >
                    {status === 'ready' ? (
                      <ArrowUp size={20} strokeWidth={2.5} />
                    ) : status === 'streaming' || status === 'submitted' ? (
                      <Square size={18} fill="currentColor" />
                    ) : (
                      <span className="size-3 rounded-xs bg-current animate-spin" />
                    )}
                  </Button>
                </div>
              </PromptInputActions>
            </div>
          </PromptInput>

          <p className="text-xs text-center text-muted-foreground mt-5 opacity-60">
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