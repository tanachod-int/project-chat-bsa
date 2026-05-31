import { getDatabase } from '@/lib/database';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { AutoModelForSequenceClassification, AutoTokenizer, env } from '@xenova/transformers';
import type { PreTrainedModel, PreTrainedTokenizer } from '@xenova/transformers';
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";
import { CacheBackedEmbeddings } from "langchain/embeddings/cache_backed";
import { InMemoryStore } from "@langchain/core/stores";

// Config สำหรับ Xenova Library
const projectRoot = process.cwd();
env.localModelPath = path.join(projectRoot, 'models');
env.allowRemoteModels = false;
env.allowLocalModels = true;

const RERANKER_MODEL_NAME = process.env.RAG_RERANKER_MODEL || 'bge-reranker-base';

interface DocumentWithScore {
  pageContent: string;
  metadata?: {
    filename?: string;
    book_name?: string;
    type?: string;
    page_number?: number | null;
    [key: string]: unknown;
  };
  rerankScore?: number;
}

interface RerankerResources {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
}

// RagService - ค้นหาเอกสาร + Rerank + บันทึก Log
export class RagService {
  private static rerankerResources: RerankerResources | null = null;

  private static assertLocalRerankerModel() {
    const modelPath = path.join(projectRoot, 'models', RERANKER_MODEL_NAME);

    if (!fs.existsSync(modelPath)) {
      throw new Error(`Local reranker model is missing at ${modelPath}`);
    }
  }

  // โหลด Reranker (bge-reranker-base) - Singleton สร้างครั้งเดียว
  private static async getReranker(): Promise<RerankerResources> {
    if (!this.rerankerResources) {
      this.assertLocalRerankerModel();
      console.log(`Loading local reranker (${RERANKER_MODEL_NAME})...`);

      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(RERANKER_MODEL_NAME, {
          local_files_only: true,
        }),
        AutoModelForSequenceClassification.from_pretrained(RERANKER_MODEL_NAME, {
          quantized: true,
          local_files_only: true,
        }),
      ]);

      this.rerankerResources = { tokenizer, model };
      console.log('Reranker loaded.');
    }
    return this.rerankerResources;
  }

  private static sigmoid(value: number) {
    return 1 / (1 + Math.exp(-value));
  }

  private static softmax(values: number[]) {
    const maxValue = Math.max(...values);
    const exps = values.map(value => Math.exp(value - maxValue));
    const sum = exps.reduce((acc, value) => acc + value, 0);

    return exps.map(value => value / sum);
  }

  private static getPositiveLabelIndex(id2label: Record<string, string> | undefined, labelCount: number) {
    if (!id2label) return Math.max(0, labelCount - 1);

    const positiveEntry = Object.entries(id2label).find(([index, label]) => {
      const normalizedLabel = label.toLowerCase();
      return (
        index === '1' ||
        normalizedLabel.includes('relevant') ||
        normalizedLabel.includes('positive') ||
        normalizedLabel === 'label_1'
      );
    });

    return positiveEntry ? Number(positiveEntry[0]) : Math.max(0, labelCount - 1);
  }

  private static extractRelevanceScore(logits: { tolist: () => unknown[] }, id2label?: Record<string, string>) {
    const logitsList = logits.tolist();
    const firstRow = logitsList[0];
    const row = (Array.isArray(firstRow) ? firstRow : logitsList) as number[];

    if (row.length === 0) return 0;
    if (row.length === 1) return this.sigmoid(row[0]);

    const probabilities = this.softmax(row);
    const positiveIndex = this.getPositiveLabelIndex(id2label, row.length);

    return probabilities[positiveIndex] ?? probabilities[row.length - 1] ?? 0;
  }

  private static async scoreDocumentPair(query: string, text: string) {
    const { tokenizer, model } = await this.getReranker();
    const modelInputs = tokenizer(query, {
      text_pair: text,
      padding: true,
      truncation: true,
      max_length: 512,
    });
    const output = await model(modelInputs);

    return this.extractRelevanceScore(
      output.logits,
      model.config?.id2label as Record<string, string> | undefined
    );
  }

  // สร้างการเชื่อมต่อ pgvector ใช้ bge-m3 ทำ embedding
  // ใช้ CacheBackedEmbeddings เพื่อช่วยจำ vector ที่เคยทำไปแล้ว ไม่ต้องคำนวณซ้ำ
  private static async createVectorStore(pool: Pool) {
    const baseEmbeddings = new OllamaEmbeddings({
      model: "bge-m3",
      baseUrl: process.env.OLLAMA_API_BASE || "http://localhost:11434",
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
  private static async rerankDocuments(query: string, docs: DocumentWithScore[], topK: number): Promise<DocumentWithScore[]> {
    if (docs.length === 0) return [];
    console.log(`Reranking ${docs.length} documents...`);

    const scoredDocs = await Promise.all(docs.map(async (doc: DocumentWithScore) => {
      try {
        const score = await this.scoreDocumentPair(query, doc.pageContent);
        return { ...doc, rerankScore: score };
      } catch {
        console.warn('Rerank failed for a retrieved document');
        return { ...doc, rerankScore: -999 };
      }
    }));

    scoredDocs.sort((a: DocumentWithScore, b: DocumentWithScore) => (b.rerankScore || 0) - (a.rerankScore || 0));
    return scoredDocs.slice(0, topK);
  }

  // ฟังก์ชันหลัก: Stage 1 Vector Search (ดึง 5) -> Stage 2 Rerank (เหลือ 2-3)
  static async searchAndRerank(query: string, finalLimit: number = 3) {
    const pool = getDatabase();
    try {
      const fetchLimit = 10;
      console.log(`Vector search started. fetch=${fetchLimit}`);

      const vectorStore = await this.createVectorStore(pool);

      // Stage 1: Vector Search (Similarity Search)
      // ค้นหาเพื่อดึงเอกสารที่เกี่ยวข้องออกมาก่อน 5 รายการ
      const initialResults = await vectorStore.similaritySearchWithScore(query, fetchLimit);

      if (!initialResults || initialResults.length === 0) {
        return 'ไม่พบเอกสารที่เกี่ยวข้องในระบบ';
      }

      const docsForRerank = initialResults.map(([doc]) => doc);

      // Stage 2: Reranking
      // ให้ AI อีกตัว (bge-reranker) มานั่งอ่านทวนทีละคู่ (Query vs Doc) เพื่อให้คะแนนความแม่นยำใหม่
      // ขั้นตอนนี้จะคัดกรองเอกสารขยะทิ้งไป เหลือแค่ตัวที่ใช่จริงๆ ตามจำนวน finalLimit
      const finalDocs = await this.rerankDocuments(query, docsForRerank, finalLimit);

      console.log(`✅ 2. Reranked: Selected top ${finalDocs.length} documents`);

      return finalDocs.map((doc: DocumentWithScore) => {
        const bookName = doc.metadata?.book_name || doc.metadata?.filename?.replace(/\.txt$/i, '') || 'ไม่ทราบชื่อหนังสือ';
        const type = doc.metadata?.type || 'ไม่ทราบประเภท';
        const page = doc.metadata?.page_number ? ` (หน้า ${doc.metadata.page_number})` : '';
        const scoreDisplay = typeof doc.rerankScore === 'number' ? `(Reranker score: ${doc.rerankScore.toFixed(4)})` : '';
        return `หนังสือ: ${bookName}${page} (${type.toUpperCase()}) ${scoreDisplay}\nเนื้อหา: ${doc.pageContent}`;
      }).join('\n\n---\n\n');

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.warn('Document search failed');
      if (errorMessage.includes('connection') || errorMessage.includes('network')) {
        throw new Error('ไม่สามารถเข้าถึงระบบค้นหาเอกสารได้ในขณะนี้');
      }
      throw new Error('เกิดข้อผิดพลาดในการค้นหาเอกสาร');
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
      const cleanAnswer = answer.replace(/"/g, '""')
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
    } catch {
      console.error('Failed to log CSV');
    }
  }
}
