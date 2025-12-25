import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Markdown } from "./markdown"
import { Bot, User } from "lucide-react"

export type MessageProps = {
  children: React.ReactNode
  className?: string
  isAssistant?: boolean
  bubbleStyle?: boolean
} & React.HTMLProps<HTMLDivElement>

const Message = ({ children, className, isAssistant = false, bubbleStyle = false, ...props }: MessageProps) => {
  if (bubbleStyle) {
    if (isAssistant) {
      // AI messages: เต็มความกว้าง, ไม่ต้องใช้ flex-col
      return (
        <div
          className={cn(
            "group w-full flex gap-4 items-start",
            className
          )}
          {...props}
        >
          <div className="shrink-0 mt-1">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <Bot className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
      )
    } else {
      // User messages: แบบ bubble ด้านขวา
      return (
        <div
          className={cn(
            "group w-full flex gap-3 items-start justify-end mb-6",
            className
          )}
          {...props}
        >
          <div className="flex flex-col items-end max-w-[calc(100%-3rem)]">
            {children}
          </div>
          <div className="shrink-0 mt-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-sm">
              <User className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className={cn("flex gap-3", className)} {...props}>
      {children}
    </div>
  )
}

export type MessageAvatarProps = {
  src: string
  alt: string
  fallback?: string
  delayMs?: number
  className?: string
}

const MessageAvatar = ({
  src,
  alt,
  fallback,
  delayMs,
  className,
}: MessageAvatarProps) => {
  return (
    <Avatar className={cn("h-8 w-8 shrink-0", className)}>
      <AvatarImage src={src} alt={alt} />
      {fallback && (
        <AvatarFallback delayMs={delayMs}>{fallback}</AvatarFallback>
      )}
    </Avatar>
  )
}

export type MessageContentProps = {
  children: React.ReactNode
  markdown?: boolean
  className?: string
  isAssistant?: boolean
  bubbleStyle?: boolean
} & React.ComponentProps<typeof Markdown> &
  React.HTMLProps<HTMLDivElement>

const MessageContent = ({
  children,
  markdown = false,
  className,
  isAssistant = false,
  bubbleStyle = false,
  ...props
}: MessageContentProps) => {
  let classNames

  if (bubbleStyle) {
    if (isAssistant) {
      // AI messages: Clean Card Style
      classNames = cn(
        "w-full px-5 py-4 mb-2 bg-card border border-border/50 rounded-2xl rounded-tl-sm shadow-sm text-foreground",
        "[&_ul]:space-y-1 [&_ol]:space-y-1 [&_li]:my-1",
        "prose prose-slate max-w-none",
        "prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-xl prose-h2:text-lg prose-h3:text-base",
        "prose-p:leading-relaxed prose-p:my-2",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-slate-900 prose-pre:text-slate-50 prose-pre:rounded-xl prose-pre:p-4",
        className
      )
    } else {
      // User messages: Gradient Bubble
      classNames = cn(
        "user-message-gradient inline-block max-w-[85%] md:max-w-[75%] rounded-2xl rounded-tr-sm px-5 py-3 break-words whitespace-pre-wrap shadow-md text-sm md:text-base leading-relaxed",
        className
      )
    }
  } else {
    classNames = cn(
      "rounded-lg p-2 text-foreground bg-secondary prose break-words whitespace-normal",
      className
    )
  }

  return markdown ? (
    <Markdown className={classNames} {...props}>
      {children as string}
    </Markdown>
  ) : (
    <div className={classNames} {...props}>
      {children}
    </div>
  )
}

export type MessageActionsProps = {
  children: React.ReactNode
  className?: string
  isAssistant?: boolean
  bubbleStyle?: boolean
} & React.HTMLProps<HTMLDivElement>

const MessageActions = ({
  children,
  className,
  isAssistant = false,
  bubbleStyle = false,
  ...props
}: MessageActionsProps) => {
  let classNames

  if (bubbleStyle) {
    if (isAssistant) {
      // AI messages: ชิดซ้าย
      classNames = cn(
        "flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-start ml-1",
        className
      )
    } else {
      // User messages: ชิดขวา
      classNames = cn(
        "flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end mr-1 mt-1",
        className
      )
    }
  } else {
    classNames = cn("text-muted-foreground flex items-center gap-2 relative z-10", className)
  }

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  )
}

export type MessageActionProps = {
  className?: string
  tooltip: React.ReactNode
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  bubbleStyle?: boolean
} & React.ComponentProps<typeof Tooltip>

const MessageAction = ({
  tooltip,
  children,
  className,
  side = "top",
  bubbleStyle = false,
  ...props
}: MessageActionProps) => {
  const buttonClassName = bubbleStyle
    ? "h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
    : ""

  return (
    <TooltipProvider>
      <Tooltip {...props}>
        <TooltipTrigger asChild>
          <div className={cn(buttonClassName, className)}>
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent side={side}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { Message, MessageAvatar, MessageContent, MessageActions, MessageAction }