import type { Metadata, Viewport } from "next"
import { Anuphan, Inter } from "next/font/google"
import "./globals.css"
import "katex/dist/katex.min.css"

const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
  display: "swap",
})

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
})

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
        className={`${anuphan.variable} ${inter.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  )
}