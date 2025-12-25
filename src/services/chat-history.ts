import { getDatabase } from '@/lib/database';
import { UIMessage } from 'ai';

// หน้าที่หลัก: จัดการ Session ห้องแชท และ Summary ใน Database
export class ChatHistoryService {

  // ฟังก์ชัน: ตรวจสอบหรือสร้าง Session ID ใหม่
  // เหตุผล: เพื่อแยกแยะว่าเรากำลังคุยเรื่องใหม่ (New Chat) หรือคุยต่อเนื่องจากเรื่องเดิม 
  // 1. ถ้ามี sessionId ส่งมา -> ใช้ของเดิม
  // 2. ถ้าไม่มี -> สร้างห้องใหม่ใน DB -> ตั้งชื่อห้องอัตโนมัติจาก "ประโยคแรกของผู้ใช้"
  static async getOrCreateSessionId(sessionId: string | undefined, userId: string | undefined, messages: UIMessage[]): Promise<string> {
    // กรณีที่ 1: เป็นการคุยต่อในห้องเดิม
    if (sessionId) return sessionId;

    // กรณีที่ 2: เริ่มคุยเรื่องใหม่ (ต้องมี userId เสมอเพื่อผูกเจ้าของ)
    if (!userId) throw new Error('User ID is required for new session');

    const pool = getDatabase();
    const client = await pool.connect();
    try {
      // ตั้งชื่อหัวข้อ โดยเอาข้อความแรกของผู้ใช้มาตัดเหลือ 50 ตัวอักษร
      const firstMessage = messages.find(m => m.role === 'user');
      let title = 'New Chat';

      if (firstMessage && Array.isArray(firstMessage.parts) && firstMessage.parts.length > 0) {
        const textPart = firstMessage.parts.find(p => p.type === 'text');
        if (textPart && typeof textPart.text === 'string') {
          // ตัดคำให้สั้นกระชับ ไม่ให้ชื่อยาวเกินไป
          title = textPart.text.slice(0, 50) + (textPart.text.length > 50 ? '...' : '');
        }
      }

      // บันทึกลงตาราง chat_sessions และคืนค่า ID ที่พึ่งสร้างกลับไป
      const result = await client.query(
        'INSERT INTO chat_sessions (title, user_id) VALUES ($1, $2) RETURNING id',
        [title, userId]
      );
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  // ฟังก์ชัน: ดึงสรุปใจความสำคัญ
  // chatbot จำบทสนทนาทั้งหมดไม่ได้ เราจึงเก็บ Summary ไว้ใน DB เพื่อให้ AI อ่านก่อนเริ่มคุยต่อ
  static async getSummary(sessionId: string): Promise<string> {
    const pool = getDatabase();
    const client = await pool.connect();
    try {
      const r = await client.query(
        'SELECT summary FROM chat_sessions WHERE id = $1 LIMIT 1',
        [sessionId]
      );
      // ถ้าไม่มีข้อมูล ให้คืนค่าว่าง (ไม่ใช่ null)
      return r.rows?.[0]?.summary ?? '';
    } finally {
      client.release();
    }
  }

  // ฟังก์ชัน: อัปเดตสรุปใหม่
  // หลังจากคุยกันไปสักพัก ระบบจะสรุปข้อมูลใหม่และมาบันทึกทับของเดิมที่นี่
  static async updateSummary(sessionId: string, summary: string) {
    const pool = getDatabase();
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE chat_sessions SET summary = $1 WHERE id = $2',
        [summary, sessionId]
      );
    } finally {
      client.release();
    }
  }
}