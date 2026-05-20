import { ChatOllama } from '@langchain/community/chat_models/ollama'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { trimMessages } from '@langchain/core/messages'
import { PostgresChatMessageHistory } from '@langchain/community/stores/message/postgres'
import { Pool } from 'pg'
import { UIMessage } from 'ai'

import { RagService } from '@/services/rag-service'

const MODEL_CONFIG = {
    modelName: "scb10x/typhoon2.5-qwen3-4b",
    temperature: 0,
    baseUrl: process.env.OLLAMA_API_BASE || "http://localhost:11434",
}

const HISTORY_CONFIG = {
    maxTokens: 6000,
    strategy: 'last' as const
}

// ChatService - จัดการการคุยกับ AI ทั้งหมด (Chain, History, Prompt, Summary)
export class ChatService {
    private static model: ChatOllama;

    // ดึง Model มาใช้ 
    private static getModel() {
        if (!this.model) {
            this.model = new ChatOllama({
                model: MODEL_CONFIG.modelName,
                temperature: MODEL_CONFIG.temperature,
                baseUrl: MODEL_CONFIG.baseUrl,
            })
        }
        return this.model;
    }

    // นับจำนวนตัวอักษรทั้งหมด - ใช้ตอน trim history ไม่ให้เกิน limit
    static async characterCounter(messages: BaseMessage[]): Promise<number> {
        let total = 0
        for (const m of messages) {
            const content = m.content
            if (typeof content === 'string') total += content.length
            else if (Array.isArray(content)) {
                total += content.reduce((acc, p) => acc + (p.type === 'text' ? p.text.length : 0), 0)
            }
        }
        return total
    }

    // เตรียม context สำหรับการคุย: ดึง history จาก DB, trim ให้พอดี, กรอง input ปัจจุบันออก
    static async prepareChatContext(
        sessionId: string,
        pool: Pool,
        messages: UIMessage[],
        input: string
    ) {
        const messageHistory = new PostgresChatMessageHistory({
            sessionId: sessionId,
            tableName: 'chat_messages',
            pool: pool
        })

        const fullHistory = await messageHistory.getMessages()

        // Trim History
        let recentWindowWithoutCurrentInput: BaseMessage[] = []
        if (sessionId && fullHistory.length > 0) {
            const trimmedWindow = await trimMessages(fullHistory, {
                maxTokens: HISTORY_CONFIG.maxTokens,
                strategy: HISTORY_CONFIG.strategy,
                tokenCounter: this.characterCounter
            })
            recentWindowWithoutCurrentInput = trimmedWindow.filter(msg =>
                !(msg instanceof HumanMessage && msg.content === input)
            )
        }

        return { messageHistory, recentWindowWithoutCurrentInput }
    }

    // ดึงเอกสารที่เกี่ยวข้องจาก RAG มาเป็น context
    static async getDocumentContext(input: string): Promise<{ context: string, hasError: boolean }> {
        try {
            const context = await RagService.searchAndRerank(input, 2) || ''
            return { context, hasError: false }
        } catch (error) {
            console.warn('⚠️ Search Error:', error)
            return {
                context: 'ไม่สามารถเข้าถึงระบบค้นหาเอกสารได้ในขณะนี้',
                hasError: true
            }
        }
    }

    // สร้าง LangChain Pipeline: System Prompt (Guardrails) -> History -> User Input
    static async createChatChain(
        recentHistory: BaseMessage[],
        persistedSummary: string | null,
        documentContext: string,
        isEvalMode: boolean = false
    ) {
        const chatHistoryForChain = [...recentHistory];
        if (persistedSummary) {
            chatHistoryForChain.unshift(new SystemMessage(persistedSummary));
        }

        // ==========================================
        // PROMPT 1: Strict Evaluation Mode
        // ==========================================
        const EVAL_SYSTEM_PROMPT = `
คุณคือ AI ผู้ช่วยทางการแพทย์ที่มีความแม่นยำสูง
หน้าที่ของคุณคือ: ตอบคำถามจากบริบท (Context) ที่ให้มาเท่านั้น
- ห้ามถามกลับ (Do not ask follow-up questions)
- ห้ามชวนคุยเล่น
- หากพบคำตอบใน Context ให้ตอบทันที
- ต้องเป็นคำถามที่สามารถตอบได้จาก Context ทุกข้อเท่านั้น


บริบทการสนทนา: {summary}

ข้อมูลจากเอกสาร:
{context}
`;

        // ==========================================
        // PROMPT 2: Normal Chatbot Mode 
        // ==========================================
        const NORMAL_SYSTEM_PROMPT = `
คุณคือ "AI ผู้ช่วยวิเคราะห์อาการพื้นฐานของโรคต่างๆอย่างเชี่ยวชาญ"

หน้าที่ของคุณคือ:

1.ตอบผู้ใช้ได้แค่อาการป่วย สุขภาพ และ โรคเท่านั้น หากถามอย่างอื่นให้ปฏิเสธเท่านั้น ตอบว่า "ฉันคือ AI ผู้ช่วยวิเคราะห์อาการป่วยพื้นฐาน สามารถตอบเรื่อง อาการ โรค และ สุขภาพเท่านั้น"

2.หากผู้ใช้มีอาการ ดังนี้ เจ็บแน่นหน้าอกอย่างรุนแรง, เป็นลมหมดสติแขนขาอ่อนแรงเฉียบพลัน, ไข้สูงหนาวสั่นชัก เกร็ง แขนขากระตุก, เลือดไหลไม่หยุด ให้ตอบว่า "คุณมีอาการร้ายแรงให้ไปพบแพทย์ หรือ โทรฉุกเฉิน 1669 ทันที!!!"

3.หากไม่มีข้อมูลในเอกสารอ้างอิง (context) หรือ ฐานข้อมูล ให้ตอบว่า "ไม่พบข้อมูลในเอกสารอ้างอิงค่ะ โปรดเข้าพบแพทย์เพื่อได้รับการวินิจฉัย" เท่านั้น

4.วิเคราะห์อาการที่ผู้ใช้แจ้งมาอย่างละเอียดที่สุด 

5.ต้องถามอาการผู้ใช้อย่างละเอียดเพื่อที่จะนำไปวิเคราะห์ต่อ โดยถามอาการเพิ่มเติมจากผู้ใช้ทีละข้อ  ถามอาการเพิ่มเติมจากผู้ใช้ 4-8 คำถาม เท่านั้นห้ามเกิน 8 คำถาม ใช้ เอกสารอ้างอิง (context) ในการมาถามเพื่อวิเคราะห์

6.หากข้อมูลในเอกสารไม่เพียงพอ ให้แจ้งผู้ใช้ตามตรงและแนะนำให้ปรึกษาแพทย์เท่านั้น

7.หลังจากวิเคราะห์เสร็จแล้วให้สรุปข้อมูลที่ผู้ใช้กรอกมาทั้งหมดเพื่อที่จะให้ผู้ใช้ตรวจเช็คอาการของตัวเองอีกรอบ และ เลือกมา 3 โรคที่ผู้ใช้มีโอกาสเป็นไปได้มากที่สุดพร้อมบอกรายละเอียดของโรค

8.หลังจากนั้นสรุป 1 โรคที่ผู้ใช้มีโอกาสเป็นไปได้มากที่สุดโดยต้องมีในฐานข้อมูลเท่านั้น และบอกข้อมูลความรู้ของโรคนั้นๆพร้อมคำแนะนำอย่างละเอียด พร้อมบอกระดับความรุนแรงของโรค ดังนี้ น้อย ปานกลาง รุนแรง หากรุนแรงต้องบอกให้ไปพบแพทย์ ต้องบอกระดับความรุนแรงทุกครั้ง และ เมื่อตอบคำถาม ให้ระบุแหล่งอ้างอิงเสมอ หากมีข้อมูลจากหลายแหล่ง ให้อ้างอิงทุกแหล่งที่เกี่ยวข้อง รูปแบบการอ้างอิง: (อ้างอิงจาก: [ชื่อหนังสือตาม metadata], หน้า [เลขหน้าตาม metadata]) ตัวอย่าง: (อ้างอิงจาก: คู่มือโรค, หน้า 700 และ หน้า 800) (อ้างอิงจาก: ตำรารักษาโรคทั่วไป นายแพทย์สุรเกียรติ อาชานานุภาพ, หน้า 52 และ หน้า 53) ห้ามตอบเป็น .txt เด็ดขาด และ หนังสือและเลขหน้าต้องสอดคล้องกันเป็นเล่มเดียวกัน ต้องมีในเอกสารอ้างอิงเท่านั้น ห้ามคิดขึ้นเองเด็ดขาด ต้องบอก ข้อควรระวัง:

ข้อมูลที่ให้เป็นเพียงการวิเคราะห์เบื้องต้น ไม่สามารถใช้แทนการวินิจฉัยและการรักษาจากแพทย์ได้ ตลอดทุกครั้ง

9.ตอบเป็นภาษาไทย สุภาพ และเข้าใจง่าย

บริบทการสนทนาก่อนหน้านี้โดยสรุปคือ: {summary}


ข้อมูลจากเอกสารที่เกี่ยวข้อง (ใช้ข้อมูลนี้ในการตอบ):

{context} `;

        const selectedPrompt = isEvalMode ? EVAL_SYSTEM_PROMPT : NORMAL_SYSTEM_PROMPT;

        const ragPrompt = ChatPromptTemplate.fromMessages([
            ['system', selectedPrompt],
            new MessagesPlaceholder('chat_history'),
            ['human', '{input}']
        ])

        return ragPrompt.pipe(this.getModel()).pipe(new StringOutputParser())
    }



    // สรุปบทสนทนาให้สั้นๆ เก็บเป็น memory ระยะยาว (รวมสรุปเดิม + ข้อความใหม่)
    static async summarizeConversation(
        persistedSummary: string | null,
        input: string,
        assistantText: string
    ) {
        const summarizerPrompt = ChatPromptTemplate.fromMessages([
            ['system', 'รวมสาระสำคัญให้สั้นที่สุด ภาษาไทย กระชับ'],
            ['human', 'นี่คือสรุปเดิม:\n{old}\n\nนี่คือข้อความใหม่:\n{delta}\n\nช่วยอัปเดตให้สั้นและครบถ้วน']
        ])

        const summarizer = summarizerPrompt.pipe(this.getModel()).pipe(new StringOutputParser())

        return await summarizer.invoke({
            old: persistedSummary || 'ไม่มีประวัติก่อนหน้า',
            delta: [`ผู้ใช้: ${input}`, `ผู้ช่วย: ${assistantText}`].join('\n')
        })
    }
}
