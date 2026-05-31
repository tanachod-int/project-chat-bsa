import type { Metadata, Viewport } from "next"
import "./globals.css"
import "katex/dist/katex.min.css"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: {
    default: "ChatBSA - แชทบอทปรึกษาอาการป่วยเบื้องต้น",
    template: "%s | ChatBSA",
  },
  description: "แชทบอท AI อัจฉริยะช่วยวิเคราะห์และให้คำแนะนำเกี่ยวกับอาการป่วยพื้นฐาน ด้วยเทคโนโลยี RAG และ LLM",
  keywords: ["Chatbot", "Health", "AI", "RAG", "ปรึกษาอาการป่วย", "LangChain", "Next.js"],
  authors: [{ name: "Tanachod Int" }],
  icons: {
    icon: "/favicon.ico",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body
        className="antialiased min-h-screen bg-background text-foreground"
      >
        {children}
      </body>
    </html>
  )
}
