import { describe, expect, it } from 'vitest'

import { ChatService } from '@/services/chat-service'

describe('ChatService emergency guardrail', () => {
  it('returns deterministic emergency guidance for red-flag symptoms', () => {
    const redFlags = [
      'ฉันเจ็บแน่นหน้าอกอย่างรุนแรงและหายใจไม่ออก',
      'อยู่ดีๆ แขนขาอ่อนแรงเฉียบพลัน',
      'เลือดไหลไม่หยุดหลังได้รับบาดเจ็บ',
      'มีอาการหน้าเบี้ยวและพูดไม่ชัด',
      'severe chest pain with difficulty breathing',
    ]

    for (const input of redFlags) {
      const response = ChatService.getEmergencyResponse(input)
      expect(response).toContain('1669')
    }
  })

  it('does not trigger for ordinary non-red-flag symptom descriptions', () => {
    expect(ChatService.getEmergencyResponse('ปวดหัวเล็กน้อยหลังนอนน้อย')).toBeNull()
  })
})
