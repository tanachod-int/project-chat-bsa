# generate_ground_truth.py - สร้างชุดข้อสอบ + เฉลยอัตโนมัติ
# สุ่มไฟล์ .txt แยกรายหนังสือ -> ให้ LLM สร้างคำถาม+เฉลย -> บันทึก CSV
# run: python scripts/generate_ground_truth.py

import os
import random
import glob
import pandas as pd
import json
import re
from langchain_community.chat_models import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# ==========================================
# การตั้งค่า (Configuration)
# ==========================================
OLLAMA_BASE_URL = "http://localhost:11434"
MODEL_NAME = "scb10x/typhoon2.5-qwen3-4b"
KNOWLEDGE_BASE_DIR = os.path.join(os.getcwd(), 'data', 'knowledge_base', 'txt')
OUTPUT_FILE = os.path.join(os.getcwd(), 'data', 'evaluation', 'ground_truth.csv')

# รายชื่อหนังสือและจำนวนข้อที่ต้องการต่อเล่ม
BOOKS_CONFIG = [
    {
        "name": "คู่มือโรค",
        "folder": "คู่มือโรค",
        "target_count": 50
    },
    {
        "name": "ตำรารักษาโรคทั่วไป", 
        "folder": "ตำรารักษาโรคทั่วไป นายแพทย์สุรเกียรติ อาชานานุภาพ",
        "target_count": 50
    }
]

# สร้างคำถาม + เฉลย 1 ข้อจากเนื้อหา (ให้ LLM อ่านแล้วออกข้อสอบ ตอบเป็น JSON)
def generate_qa(text_content, page_number, book_name):
    prompt = ChatPromptTemplate.from_messages([
        ("system", """คุณคือผู้เชี่ยวชาญด้านการออกข้อสอบทางการแพทย์
หน้าที่ของคุณคืออ่านเนื้อหาที่ได้รับ แล้วสร้าง "คำถาม" และ "เฉลย" ที่ถูกต้อง 1 ข้อ
- คำถามต้องชัดเจน เกี่ยวข้องกับเนื้อหาจากหนังสือ "{book_name}"
- เฉลยต้องถูกต้องตามเนื้อหาที่ให้เท่านั้น ห้ามมั่ว
- **ตอบกลับเป็น JSON เท่านั้น** โดยมี key คือ "question" และ "answer"
ตัวอย่าง:
{{
  "question": "อาการสำคัญของผู้ป่วยคืออะไร?",
  "answer": "มีไข้สูงและปวดศีรษะ"
}}"""),
        ("human", "เนื้อหา (หน้า {page}):\n{text}")
    ])

    llm = ChatOllama(model=MODEL_NAME, base_url=OLLAMA_BASE_URL, temperature=0.7)
    chain = prompt | llm | StrOutputParser()

    try:
        result = chain.invoke({"text": text_content, "page": page_number, "book_name": book_name})
        clean_result = result.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_result)
        question = data.get("question")
        answer = data.get("answer")
        
        if question and answer:
            return question, answer
        else:
            return None, None
            
    except Exception as e:
        print(f"❌ สร้างคำถาม-เฉลยไม่สำเร็จ {book_name} หน้า {page_number}: {e}") 
        return None, None

def main():
    print(f"📝 เริ่มต้นสร้างชุดข้อสอบ Ground Truth...")
    
    all_generated_data = []

    for book in BOOKS_CONFIG:
        book_name = book["name"]
        folder_name = book["folder"]
        target_count = book["target_count"]
        
        book_path = os.path.join(KNOWLEDGE_BASE_DIR, folder_name)
        
        print(f"\n📘 กำลังประมวลผลหนังสือ: {book_name}")
        print(f"   path: {book_path}")

        # หาไฟล์ทั้งหมดในโฟลเดอร์หนังสือ
        files = glob.glob(os.path.join(book_path, "*.txt"))
        if not files:
            print(f"❌ ไม่พบไฟล์ Text ในโฟลเดอร์ {folder_name}")
            continue

        total_files = len(files)
        print(f"📂 พบไฟล์ทั้งหมด {total_files} ไฟล์ (ต้องการ {target_count} ข้อ)")
        
        # สุ่มไฟล์ตามจำนวนที่ต้องการ
        selected_files = random.sample(files, min(target_count, total_files))
        
        book_data = []
        for i, file_path in enumerate(selected_files):
            filename = os.path.basename(file_path)
            page_number = filename.replace('.txt', '')
            
            # อ่านเนื้อหา
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    if len(content) > 3000:
                        content = content[:3000]
            except Exception as e:
                print(f"❌ อ่านไฟล์ {filename} ไม่ได้: {e}")
                continue

            # ให้ AI สร้างโจทย์
            print(f"   [{i+1}/{len(selected_files)}] สร้างคำถาม-เฉลยจากหน้า {page_number}...")
            question, answer = generate_qa(content, page_number, book_name)
            
            if question and answer:
                book_data.append({
                    "question": question,
                    "ground_truth": answer,
                    "book_name": book_name,
                    "page_number": page_number
                })
            else:
                print(f"      ❌ สร้างคำถาม-เฉลยไม่สำเร็จสำหรับ {filename}")

        all_generated_data.extend(book_data)
        print(f"✅ ได้ข้อสอบจาก '{book_name}' จำนวน {len(book_data)} ข้อ")

    # บันทึกผลลัพธ์
    if all_generated_data:
        df = pd.DataFrame(all_generated_data)

        columns_order = ['question', 'ground_truth', 'book_name', 'page_number']
        df = df[columns_order]
        df.to_csv(OUTPUT_FILE, index=False, encoding='utf-8')
        
        print(f"\n💾 บันทึกเสร็จสิ้น! รวมทั้งหมด {len(df)} ข้อ")
        print(f"ไฟล์อยู่ที่: {OUTPUT_FILE}")
        print(f"Columns: {', '.join(df.columns)}")
    else:
        print("\n❌ ไม่สามารถสร้างโจทย์ได้เลย")

if __name__ == "__main__":
    main()
