"use client"

// นำเข้า IMPORTS
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  PlusIcon,
  Trash2,
  MessageSquare,
  Sparkles
} from "lucide-react"
import { LogoutButton } from "@/components/logout-button"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, memo, useMemo } from "react"
import { useChatContext } from "@/contexts/chat-context"
import { useSessionContext } from "@/contexts/session-context"
import { groupSessionsByDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

// ประเภทข้อมูล
interface ChatSidebarProps {
  display_name: string
  email: string
  userId?: string
}

export const ChatSidebar = memo(function ChatSidebar({
  display_name,
  email,
  userId
}: ChatSidebarProps) {

  // Hooks และ State
  const { state } = useSidebar()
  const pathname = usePathname()
  const router = useRouter()
  const { resetChat } = useChatContext()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)

  const { sessions, loading, fetchSessions, deleteSession } = useSessionContext()

  const groupedSessions = useMemo(() => {
    return groupSessionsByDate(sessions)
  }, [sessions])

  // ฟังก์ชั่นจัดการ Event
  const handleNewChat = async () => {
    if (!userId) return

    try {
      resetChat()
      localStorage.removeItem('currentSessionId')
      router.push("/chat")
    } catch (error) {
      console.error('Error navigating to new chat:', error)
      router.push("/chat")
    }
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!userId) return
    setSessionToDelete(sessionId)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return

    try {
      const success = await deleteSession(sessionToDelete)
      if (success) {
        await fetchSessions()
        if (pathname === `/chat/${sessionToDelete}`) {
          resetChat()
          localStorage.removeItem('currentSessionId')
          router.push("/chat")
        }
      }
    } catch (error) {
      console.error('Error deleting session:', error)
    } finally {
      setDeleteDialogOpen(false)
      setSessionToDelete(null)
    }
  }

  // ส่วนแสดงผลหลัก
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">

      {/* ส่วนหัว */}
      <SidebarHeader className="flex flex-row items-center justify-between gap-2 px-4 py-5">
        <div className="flex flex-row items-center gap-3 px-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center w-full">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-lg font-bold text-sidebar-foreground tracking-tight leading-none">
              ChatBSA
            </span>
            <span className="text-xs text-sidebar-foreground/60 font-medium">
              Analyze basic symptoms
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* ส่วนเนื้อหา */}
      <SidebarContent className="px-3 pt-2">

        {/* ปุ่มแชทใหม่ */}
        <div className="mb-6 group-data-[collapsible=icon]:px-0">
          <Button
            onClick={handleNewChat}
            className={cn(
              "w-full justify-start gap-3 rounded-xl h-11 shadow-sm transition-all duration-200",
              "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md",
              "group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center"
            )}
            title="New Chat"
          >
            <PlusIcon className="size-5" />
            <span className="font-medium group-data-[collapsible=icon]:hidden">
              New Chat
            </span>
          </Button>
        </div>

        {/* สถานะกำลังโหลด */}
        {loading && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden animate-pulse px-2">
            <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
            <div className="space-y-3">
              <div className="h-8 w-full bg-gray-100 rounded-lg" />
              <div className="h-8 w-full bg-gray-100 rounded-lg" />
              <div className="h-8 w-full bg-gray-100 rounded-lg" />
            </div>
          </SidebarGroup>
        )}

        {/* รายการประวัติแชท */}
        {!loading && groupedSessions.map((group) => (
          <SidebarGroup
            key={group.period}
            className="group-data-[collapsible=icon]:hidden py-2"
          >
            <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider px-2 mb-1">
              {group.period}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.sessions.map((session) => {
                const isActive = pathname === `/chat/${session.id}`
                return (
                  <div key={session.id} className="relative group/item mb-0.5">
                    <Link href={`/chat/${session.id}`} className="block">
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={state === "collapsed" ? session.title : undefined}
                        className={cn(
                          "h-10 rounded-lg px-3 pr-9 transition-all duration-200",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <span className="truncate text-sm">
                          {session.title}
                        </span>
                      </SidebarMenuButton>
                    </Link>
                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-all duration-200 p-1.5 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive"
                      title="ลบประวัติการแชท"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        {/* สถานะไม่มีข้อมูล */}
        {!loading && groupedSessions.length === 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <div className="px-4 py-8 text-center">
              <div className="w-12 h-12 bg-sidebar-accent/50 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-6 h-6 text-sidebar-foreground/30" />
              </div>
              <p className="text-sm text-sidebar-foreground/60">
                No chat history yet.<br />
                Start a new conversation!
              </p>
            </div>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ส่วนท้าย */}
      <SidebarFooter className="p-4 border-t border-sidebar-border/50 group-data-[collapsible=icon]:p-2 bg-sidebar/50">
        <Popover>
          <PopoverTrigger asChild>
            <div className={cn(
              "flex items-center gap-3 p-2 rounded-xl transition-all duration-200 cursor-pointer",
              "hover:bg-sidebar-accent group-data-[state=open]:bg-sidebar-accent",
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1"
            )}>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-sm group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
                <span className="text-primary-foreground font-semibold text-sm group-data-[collapsible=icon]:text-xs">
                  {display_name
                    ? display_name.charAt(0).toUpperCase()
                    : email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden text-left">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">
                  {display_name || email.split("@")[0]}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {email}
                </p>
              </div>
            </div>
          </PopoverTrigger>

          {/* Popover โปรไฟล์ผู้ใช้ */}
          <PopoverContent side="top" align="start" className="w-64 p-1 rounded-xl shadow-xl border-border/50">
            <div className="p-1">
              <div className="flex items-center gap-3 p-3 mb-1 rounded-lg bg-sidebar-accent/30">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
                  <span className="text-primary-foreground font-semibold text-xs">
                    {display_name
                      ? display_name.charAt(0).toUpperCase()
                      : email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {display_name || email.split("@")[0]}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {email}
                  </p>
                </div>
              </div>
              <LogoutButton />
            </div>
          </PopoverContent>
        </Popover>
      </SidebarFooter>

      {/* Dialog ยืนยัน */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="text-center sm:text-center">
            <AlertDialogTitle>ลบประวัติการแชท</AlertDialogTitle>
            <AlertDialogDescription>
              คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการแชทนี้?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false)
              setSessionToDelete(null)
            }} className="rounded-xl">
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSession}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl"
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  )
})