# Chat BSA - Medical RAG Chatbot

Chat BSA is a full-stack Retrieval-Augmented Generation (RAG) chatbot designed for medical and health-related contexts. It uses a two-stage retrieval pipeline (vector search + cross-encoder reranking) backed by local AI models via Ollama, ensuring data privacy and offline capability.

Built with Next.js 15, LangChain, and PostgreSQL (pgvector).

## Key Features

- **Two-Stage RAG Pipeline**: Combines pgvector similarity search with a local cross-encoder reranker (`bge-reranker-base` via `@xenova/transformers`) to maximize retrieval accuracy.
- **Local-First AI**: All models run locally through Ollama (`bge-m3` for embeddings, `typhoon2.5-qwen3-4b` for generation) for maximum privacy.
- **Conversation Memory**: Maintains per-session chat history with rolling summarization for long-term context retention.
- **Medical Guardrails**: Built-in prompt safeguards for symptom analysis, emergency red-flag detection, and mandatory source attribution from reference textbooks.
- **Streaming Responses**: Real-time token-by-token streaming via Server-Sent Events for a responsive chat experience.
- **Secure Authentication**: User authentication and session management powered by Supabase SSR.
- **Rich Text Rendering**: Supports Markdown and mathematical equations (KaTeX) in chat responses.
- **Evaluation Pipeline**: End-to-end RAG quality measurement using the Ragas framework (Faithfulness, Answer Relevancy, Context Precision, Context Recall).

## Tech Stack

**Frontend:**

- [Next.js 15](https://nextjs.org/) (App Router)
- [React 19](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/) and [Lucide Icons](https://lucide.dev/)

**Backend and AI:**

- [LangChain](https://js.langchain.com/) and [Vercel AI SDK](https://sdk.vercel.ai/)
- [@xenova/transformers](https://huggingface.co/docs/transformers.js) (local reranking with `bge-reranker-base`)
- [Ollama](https://ollama.com/) (local embeddings with `bge-m3`, LLM with `typhoon2.5-qwen3-4b`)

**Database and Auth:**

- [PostgreSQL](https://www.postgresql.org/) with [pgvector](https://github.com/pgvector/pgvector)
- [Supabase](https://supabase.com/) (authentication)
- Docker and Docker Compose

## Prerequisites

- Node.js v20+
- Docker and Docker Compose
- [Ollama](https://ollama.com/) installed on the host machine
- A [Supabase](https://supabase.com/) project (for authentication)

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd project-chat-bsa
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env.local
```

Configure the following variables in `.env.local`:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` | Your Supabase anon/public key |
| `PG_HOST` | PostgreSQL host (use `localhost` for local dev) |
| `PG_PORT` | PostgreSQL port (default: `5441` via Docker Compose) |
| `PG_USER` | PostgreSQL username |
| `PG_PASSWORD` | PostgreSQL password |
| `PG_DATABASE` | PostgreSQL database name |
| `OLLAMA_API_BASE` | Ollama API base URL (default: `http://localhost:11434/`) |
| `OLLAMA_MODEL_NAME` | LLM model name (default: `scb10x/typhoon2.5-qwen3-4b`) |
| `RAG_EMBEDDING_BATCH_SIZE` | Batch size for embedding ingestion (default: `15`) |

### 4. Pull the required Ollama models

```bash
ollama pull bge-m3
ollama pull scb10x/typhoon2.5-qwen3-4b
```

### 5. Prepare the Reranker model

The reranker (`bge-reranker-base`) runs locally via `@xenova/transformers`. On first request, it will attempt to load the model from the `models/` directory.

- **Option A (online)**: Set `env.allowRemoteModels = true` in `src/services/rag-service.ts` to auto-download from Hugging Face on first run.
- **Option B (offline)**: Manually place the ONNX model files into `models/bge-reranker-base/`.

### 6. Start the database

```bash
docker compose up -d db
```

This launches PostgreSQL 16 with the pgvector extension. The schema is automatically initialized via `scripts/init.sql`.

### 7. Populate the knowledge base

Place your medical text files in `data/knowledge_base/txt/`, then run:

```bash
npx tsx scripts/embed-txt.ts
```

This splits the text into chunks, generates vector embeddings using `bge-m3`, and stores them in the `documents` table.

### 8. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start chatting.

## Running with Docker Compose (Full Stack)

To run the entire application (database + web server) in containers:

```bash
docker compose up --build -d
```

> **Note:** The web container connects to the host's Ollama instance via `host.docker.internal:11434` for GPU-accelerated inference. Make sure Ollama is running on the host machine.

## Project Structure

```
project-chat-bsa/
├── src/
│   ├── app/              # Next.js App Router (pages, layouts, API routes)
│   ├── components/       # React UI components (chat, auth, sidebar)
│   ├── services/         # Core business logic
│   │   ├── rag-service.ts    # Two-stage retrieval (vector search + reranking)
│   │   ├── chat-service.ts   # LLM interaction, prompt templates, summarization
│   │   └── chat-history.ts   # Session and message history management
│   ├── hooks/            # Custom React hooks (chat sessions, chat history)
│   ├── lib/              # Database client, Supabase client, utilities
│   └── constants/        # API endpoint constants
├── scripts/
│   ├── init.sql              # Database schema initialization
│   ├── ocr-image.ts          # OCR pipeline (image to text via Typhoon-OCR)
│   ├── embed-txt.ts          # Text chunking and vector embedding ingestion
│   ├── generate_ground_truth.py  # Ground truth generation for evaluation
│   ├── batch_answer.py       # Batch evaluation against the chatbot API
│   └── evaluate_ragas.py     # RAG quality scoring with Ragas framework
├── docker-compose.yml    # PostgreSQL + web app container orchestration
├── Dockerfile            # Multi-stage build for the Next.js application
├── .env.example          # Environment variable template
└── requirements.txt      # Python dependencies for evaluation scripts
```

## Data Pipeline

The project includes a complete data pipeline for building and evaluating the knowledge base:

1. **OCR** (`scripts/ocr-image.ts`): Converts scanned medical textbook images to structured text using Typhoon-OCR via Ollama.
2. **Embedding** (`scripts/embed-txt.ts`): Splits text into chunks (6000 chars, 600 overlap), embeds with `bge-m3`, and stores vectors in PostgreSQL.
3. **Ground Truth Generation** (`scripts/generate_ground_truth.py`): Generates question-answer pairs from the textbook content for evaluation.
4. **Batch Evaluation** (`scripts/batch_answer.py`): Sends ground truth questions to the chatbot API and collects responses with retrieved contexts.
5. **Quality Scoring** (`scripts/evaluate_ragas.py`): Measures Faithfulness, Answer Relevancy, Context Precision, and Context Recall using the Ragas framework.

## Database Schema

The application uses three PostgreSQL tables:

- **`chat_sessions`**: Stores conversation sessions with rolling summaries for long-term memory.
- **`chat_messages`**: Stores individual messages (human/AI) as JSONB, linked to sessions.
- **`documents`**: Stores text chunks with 1024-dimensional vector embeddings (`bge-m3`) and metadata (filename, page number, book name).

## License

This project is licensed under the MIT License.
