# Chat BSA - Medical RAG Chatbot 🏥🤖

Chat BSA is a full-stack Retrieval-Augmented Generation (RAG) chatbot designed specifically for medical and health-related contexts. Built with Next.js 15, LangChain, and PostgreSQL (pgvector), it enables context-aware conversations by retrieving relevant documents before generating responses.

## ✨ Key Features

- **Advanced RAG Pipeline**: Integrates LangChain with `pgvector` for efficient similarity search and context retrieval.
- **Local & Cloud AI Support**: Compatible with local models via Ollama (e.g., `bge-m3`, `bge-reranker-base`) and cloud providers (OpenAI, Google GenAI).
- **Document Processing**: Capable of ingesting and parsing PDFs and CSVs using `pdf-parse` and `csv-parser`.
- **Rich Text Rendering**: Renders markdown, code snippets (Shiki), and complex mathematical equations (KaTeX) seamlessly.
- **Modern UI/UX**: Built with Next.js 15 App Router, Tailwind CSS v4, and Radix UI primitives.
- **Secure Authentication**: Integrated with Supabase for robust user authentication and session management.

## 🛠️ Tech Stack

**Frontend:**
- [Next.js 15](https://nextjs.org/) (App Router, Turbopack)
- [React 19](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/) & [Lucide Icons](https://lucide.dev/)

**Backend & AI:**
- [LangChain](https://js.langchain.com/) & [Vercel AI SDK](https://sdk.vercel.ai/)
- [@xenova/transformers](https://huggingface.co/docs/transformers.js) (for local reranking)
- Ollama (Local Embeddings & Reranking)
- OpenAI / Google GenAI SDKs

**Database & Auth:**
- [PostgreSQL](https://www.postgresql.org/) with [pgvector](https://github.com/pgvector/pgvector) (Vector Database)
- [Supabase](https://supabase.com/) (Auth)
- Docker & Docker Compose

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Docker & Docker Compose
- Ollama (if using local models like `bge-m3`)
- Supabase project (for authentication)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/chat-bsa.git
   cd chat-bsa
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Environment Variables**
   Copy the example environment file and fill in your credentials:
   ```bash
   cp .env.example .env.local
   ```
   *Make sure to configure your Supabase URL, Anon Key, Database URL, and any AI API Keys.*

4. **Start the Vector Database**
   Launch PostgreSQL with `pgvector` using Docker Compose:
   ```bash
   docker-compose up -d
   ```

5. **Run the Development Server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📁 Project Architecture

- `/src/app` - Next.js App Router pages and layouts.
- `/src/components` - Reusable React components (UI and Chat interfaces).
- `/src/services` - Core business logic, including `rag-service.ts` and `chat-service.ts`.
- `/docker-compose.yml` - PostgreSQL/pgvector database configuration.

## 🗺️ Roadmap & Future Improvements

- [ ] **UI Overhaul**: Upgrade the landing page with medical-themed visual directions and gradients.
- [ ] **Robust Form Handling**: Refactor forms using `react-hook-form` and `zod` for better validation.
- [ ] **Error Boundaries**: Implement `error.tsx` and `loading.tsx` for graceful degradation.
- [ ] **Environment Configuration**: Decouple hardcoded model URLs and paths to rely fully on environment variables.

## 📄 License

This project is licensed under the MIT License.
