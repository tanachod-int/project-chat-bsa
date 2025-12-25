import { getDatabase } from '@/lib/database';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { pipeline, env } from '@xenova/transformers';
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { CacheBackedEmbeddings } from "langchain/embeddings/cache_backed";
import { InMemoryStore } from "@langchain/core/stores";

// Config สำหรับ Xenova Library
const projectRoot = process.cwd();
env.localModelPath = path.join(projectRoot, 'models');
env.allowRemoteModels = false;
env.allowLocalModels = true;

// RagService - ค้นหาเอกสาร + Rerank + บันทึก Log
export class RagService {
  private static rerankerPipeline: any = null;

  // โหลด Reranker (bge-reranker-base) - Singleton สร้างครั้งเดียว
  private static async getReranker() {
    if (!this.rerankerPipeline) {
      console.log('Loading Local Reranker (bge-reranker-base)...');
      // ใช้ pipeline 'text-classification' สำหรับทำ Cross-Encoder
      // quantized: true คือการบีบอัด model เป็น int8 เพื่อให้รันเร็วขึ้นและกินแรมน้อยลง
      this.rerankerPipeline = await pipeline('text-classification', 'bge-reranker-base', {
        quantized: true,
      });
      console.log('Reranker loaded.');
    }
    return this.rerankerPipeline;
  }

  // สร้างการเชื่อมต่อ pgvector ใช้ bge-m3 ทำ embedding
  // ใช้ CacheBackedEmbeddings เพื่อช่วยจำ vector ที่เคยทำไปแล้ว ไม่ต้องคำนวณซ้ำ
  private static async createVectorStore(pool: Pool) {
    const baseEmbeddings = new OllamaEmbeddings({
      model: "bge-m3",
      baseUrl: "http://localhost:11434",
    });
    const cacheStore = new InMemoryStore();
    const embeddings = CacheBackedEmbeddings.fromBytesStore(
      baseEmbeddings,
      cacheStore,
      { namespace: "rag_embeddings" }
    );
    return new PGVectorStore(embeddings, {
      pool: pool,
      tableName: 'documents',
    });
  }

  // Rerank เอกสารใหม่ - เทียบ query กับแต่ละ doc แล้วเรียงตามคะแนน
  // ใช้ Cross-Encoder เอา Query + Doc มาอ่านพร้อมกัน
  private static async rerankDocuments(query: string, docs: any[], topK: number) {
    if (docs.length === 0) return [];
    console.log(`Reranking ${docs.length} documents...`);

    const reranker = await this.getReranker();
    const scoredDocs = await Promise.all(docs.map(async (doc: any) => {
      try {
        const output = await reranker(query, doc.pageContent);
        const score = output[0]?.score || 0;
        return { ...doc, rerankScore: score };
      } catch (e) {
        console.warn('Rerank error for doc:', e);
        return { ...doc, rerankScore: -999 };
      }
    }));

    scoredDocs.sort((a: any, b: any) => b.rerankScore - a.rerankScore);
    return scoredDocs.slice(0, topK);
  }

  // ฟังก์ชันหลัก: Stage 1 Vector Search (ดึง 5) -> Stage 2 Rerank (เหลือ 2-3)
  static async searchAndRerank(query: string, finalLimit: number = 3) {
    const pool = getDatabase();
    try {
      const fetchLimit = 10;
      console.log(`🔎 1. Vector Search: query="${query}", fetch=${fetchLimit}`);

      const vectorStore = await this.createVectorStore(pool);

      // Stage 1: Vector Search (Similarity Search)
      // ค้นหาเพื่อดึงเอกสารที่เกี่ยวข้องออกมาก่อน 5 รายการ
      const initialResults = await vectorStore.similaritySearchWithScore(query, fetchLimit);

      if (!initialResults || initialResults.length === 0) {
        return `ไม่พบเอกสารที่เกี่ยวข้องกับ "${query}" ในระบบ`;
      }

      const docsForRerank = initialResults.map(([doc]) => doc);

      // Stage 2: Reranking
      // ให้ AI อีกตัว (bge-reranker) มานั่งอ่านทวนทีละคู่ (Query vs Doc) เพื่อให้คะแนนความแม่นยำใหม่
      // ขั้นตอนนี้จะคัดกรองเอกสารขยะทิ้งไป เหลือแค่ตัวที่ใช่จริงๆ ตามจำนวน finalLimit
      const finalDocs = await this.rerankDocuments(query, docsForRerank, finalLimit);

      console.log(`✅ 2. Reranked: Selected top ${finalDocs.length} documents`);

      return finalDocs.map((doc: any) => {
        const filename = doc.metadata?.filename || 'ไม่ทราบชื่อไฟล์';
        const type = doc.metadata?.type || 'ไม่ทราบประเภท';
        const page = doc.metadata?.page_number ? ` (หน้า ${doc.metadata.page_number})` : '';
        const scoreDisplay = doc.rerankScore ? `(Confidence: ${(doc.rerankScore * 100).toFixed(1)}%)` : '';
        return `ไฟล์: ${filename}${page} (${type.toUpperCase()}) ${scoreDisplay}\nเนื้อหา: ${doc.pageContent}`;
      }).join('\n\n---\n\n');

    } catch (e: any) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.log('Search error:', errorMessage);
      if (errorMessage.includes('connection') || errorMessage.includes('network')) {
        throw new Error('ไม่สามารถเข้าถึงระบบค้นหาเอกสารได้ในขณะนี้');
      }
      throw new Error(`เกิดข้อผิดพลาดในการค้นหาเอกสาร: ${errorMessage}`);
    }
  }

  // บันทึก log ลง CSV สำหรับเอาไปวัดผลด้วย Ragas
  // ข้อมูลที่บันทึกจะถูกนำไปใช้โดย scripts/evaluate_ragas.py เพื่อคำนวณค่า Faithfulness / Relevancy
  static appendToCSV(question: string, answer: string, context: string = '') {
    try {
      const logFilePath = path.join(process.cwd(), 'data', 'chatbot_log', 'chatbot_logs.csv');
      const dir = path.dirname(logFilePath);

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const fileExists = fs.existsSync(logFilePath);
      if (!fileExists) {
        fs.writeFileSync(logFilePath, '\uFEFFtimestamp,question,chatbot_answer,context\n', 'utf8');
      }

      const safeQuestion = `"${question.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
      let cleanAnswer = answer.replace(/"/g, '""')
        .replace(/\n/g, ' ')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\s+/g, ' ');

      const safeAnswer = `"${cleanAnswer.trim()}"`;
      const safeContext = `"${context.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
      const timestamp = new Date().toISOString();
      const csvLine = `${timestamp},${safeQuestion},${safeAnswer},${safeContext}\n`;

      fs.appendFileSync(logFilePath, csvLine, 'utf8');
      console.log('📝 Logged to CSV successfully');
    } catch (error) {
      console.error('Failed to log CSV:', error);
    }
  }
}