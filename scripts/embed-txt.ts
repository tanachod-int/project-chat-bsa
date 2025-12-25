// embed-txt.ts - สร้าง Vector Embeddings แล้วเก็บลง PostgreSQL
// อ่าน .txt -> แบ่ง Chunks -> Embed ด้วย bge-m3 -> เก็บ pgvector
// run: npx tsx scripts/embed-txt.ts

import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getDatabase } from '../src/lib/database';

import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { CacheBackedEmbeddings } from "langchain/embeddings/cache_backed";
import { LocalFileStore } from "langchain/storage/file_system";
import { homedir } from "os";

// ===============================================
// Configuration - การตั้งค่า
// ===============================================
const rawOllamaUrl = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_API_BASE || "http://localhost:11434";
const OLLAMA_BASE_URL = rawOllamaUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');

const OLLAMA_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || "bge-m3";
const CHUNK_SIZE = parseInt(process.env.RAG_CHUNK_SIZE || "6000", 10);
const CHUNK_OVERLAP = parseInt(process.env.RAG_CHUNK_OVERLAP || "600", 10);
const DOCS_RELATIVE_PATH = process.env.RAG_DOCS_DIR || "data/knowledge_base/txt";
const DOCS_DIR = path.join(process.cwd(), DOCS_RELATIVE_PATH);
const BATCH_SIZE = parseInt(process.env.RAG_EMBEDDING_BATCH_SIZE || "15", 10);

// สร้าง Knowledge Base: TRUNCATE -> โหลดไฟล์ -> แบ่ง Chunks + Metadata -> Embed -> เก็บลง DB
async function runEmbedding() {
    const pool = getDatabase();

    try {
        console.log(`🔄 เริ่มต้น Embedding: Model=${OLLAMA_MODEL}, Chunk=${CHUNK_SIZE}/${CHUNK_OVERLAP}, Batch=${BATCH_SIZE}`);

        // ===============================================
        // ล้างข้อมูลเก่า: DROP TABLE แล้วให้ LangChain สร้างใหม่
        // ===============================================
        const client = await pool.connect();
        try {
            await client.query('DROP TABLE IF EXISTS documents');
            console.log(`🗑️ ล้างตาราง documents เรียบร้อย`);
        } finally {
            client.release();
        }

        // ===============================================
        // โหลดเอกสาร (.txt เท่านั้น ตาม use case หนังสือ)
        // ===============================================
        if (!fs.existsSync(DOCS_DIR)) {
            console.error(`❌ ไม่พบโฟลเดอร์: ${DOCS_DIR}`);
            process.exit(1);
        }

        const loader = new DirectoryLoader(DOCS_DIR, {
            ".txt": (filePath) => new TextLoader(filePath),
        });

        const rawDocs = await loader.load();


        if (rawDocs.length === 0) {
            console.error(`❌ ไม่พบไฟล์ .txt ใน ${DOCS_RELATIVE_PATH}`);
            process.exit(1);
        }

        // ===============================================
        // แยกเอกสาร: ปรับ separators ให้เหมาะกับหนังสือ
        // ===============================================
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: CHUNK_SIZE,
            chunkOverlap: CHUNK_OVERLAP,
            separators: ["\n\n", "\n", " ", ""],
        });

        const chunks = await splitter.splitDocuments(rawDocs);
        console.log(`📂 โหลด ${rawDocs.length} ไฟล์ → แบ่งเป็น ${chunks.length} chunks`);

        // ===============================================
        // Embeddings Setup
        // ===============================================
        const baseEmbeddings = new OllamaEmbeddings({
            model: OLLAMA_MODEL,
            baseUrl: OLLAMA_BASE_URL,
        });

        const cacheDir = path.join(homedir(), ".rag-cache", "embeddings");
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        const cacheStore = new LocalFileStore({ rootPath: cacheDir });
        const embeddings = CacheBackedEmbeddings.fromBytesStore(
            baseEmbeddings,
            cacheStore,
            { namespace: OLLAMA_MODEL }
        );

        const vectorStore = await PGVectorStore.initialize(embeddings, {
            pool: pool,
            tableName: 'documents',
        });

        // ===============================================
        // metadata: รองรับชื่อหนังสือ (Folder) ภาษาไทย + เลขหน้า
        // ===============================================
        const chunksWithMetadata = chunks.map((chunk, index) => {
            const source = chunk.metadata.source || 'unknown';

            // 1. ดึงชื่อไฟล์ (เช่น 1.txt)
            const filename = source.split(/[/\\]/).pop() || 'unknown';

            // 2. ดึงชื่อโฟลเดอร์ (Parent Directory) มาเป็นชื่อหนังสือ
            // เช่น .../หนังสือรักษาโรค/1.txt -> จะได้ "หนังสือรักษาโรค"
            const parentDir = path.dirname(source).split(/[/\\]/).pop() || 'unknown';

            // 3. ดึงเลขหน้าจากชื่อไฟล์
            const pageStr = filename.replace(/\.txt$/, '');
            const page_number = /^\d+$/.test(pageStr) ? parseInt(pageStr, 10) : null;
            const sanitizeString = (str: string) => {
                return str.replace(/[^\w.\-\u0E00-\u0E7F\s]/g, '_').substring(0, 200);
            };

            const safeFilename = sanitizeString(filename);
            const safeBookName = sanitizeString(parentDir);

            return {
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    filename: safeFilename,
                    book_name: safeBookName,
                    page_number,
                    chunk_index: index,
                    chunk_size: chunk.pageContent.length,
                    timestamp: new Date().toISOString(),
                    type: 'text'
                }
            };
        });

        const totalBatches = Math.ceil(chunksWithMetadata.length / BATCH_SIZE);

        for (let i = 0; i < chunksWithMetadata.length; i += BATCH_SIZE) {
            const batch = chunksWithMetadata.slice(i, i + BATCH_SIZE);
            const currentBatch = Math.floor(i / BATCH_SIZE) + 1;


            await vectorStore.addDocuments(batch);
        }

        console.log(`✅ เสร็จสิ้น! อัพเดท Knowledge Base แล้ว (${chunksWithMetadata.length} chunks)`);
        process.exit(0);

    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาด:', error);
        process.exit(1);
    }
}

runEmbedding();