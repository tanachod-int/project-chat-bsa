# batch_answer.py - ส่งคำถามแบบ Batch ทดสอบ Chatbot
# อ่านคำถามจาก ground_truth.csv -> ส่งไป API -> API บันทึก log เอง
# run: python scripts/batch_answer.py

import pandas as pd
import requests
import time
import os
import csv
import json

# Configuration
API_URL = "http://localhost:3000/api/chat_main"
INPUT_FILE = os.path.join(os.getcwd(), 'data', 'evaluation', 'ground_truth.csv')
OUTPUT_FILE = os.path.join(os.getcwd(), 'data', 'evaluation', 'ragas_evaluation.csv')
DELAY_SECONDS = 0.5
TEST_LIMIT = 100  # จำนวนข้อที่จะเทส

def main():
    print("🔄 เริ่มต้น Batch Answer Script...")
    
    if not os.path.exists(INPUT_FILE):
        print(f"❌ ไม่พบไฟล์ข้อมูล: {INPUT_FILE}")
        return
        
    try:
        encodings = ['utf-8', 'cp874', 'utf-8-sig']
        df = None
        
        for enc in encodings:
            try:
                df = pd.read_csv(INPUT_FILE, encoding=enc)
                break
            except UnicodeDecodeError:
                continue
                
        if df is None:
            print("❌ ไม่สามารถอ่านไฟล์ CSV ได้")
            return

        # ตรวจสอบว่ามีคอลัมน์ ground_truth หรือไม่ ถ้าหากไม่มีก็สร้างว่างๆ ไว้
        if 'ground_truth' not in df.columns:
            df['ground_truth'] = ""

        if 'question' not in df.columns:
            print("❌ ไฟล์ CSV ต้องมีคอลัมน์ 'question'")
            return
            
        data = df.to_dict('records')

        if TEST_LIMIT and TEST_LIMIT < len(data):
             data = data[:TEST_LIMIT]
             print(f"⚠️ โหมดทดสอบ: จำกัด {TEST_LIMIT} ข้อ")
             
        print(f"📂 กำลังประมวลผล {len(data)} รายการ...")

        # เตรียมไฟล์ Output และเขียน Header ใหม่ทุกครั้ง
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow(['question', 'ground_truth', 'answer', 'contexts'])

        for i, row in enumerate(data, 1):
            question = str(row['question']).strip()
            ground_truth = str(row.get('ground_truth', '')).strip()
            
            try:
                headers = {
                    "Content-Type": "application/json",
                    "x-eval-mode": "true" 
                }
                
                payload = {
                    "messages": [
                        {
                            "role": "user", 
                            "content": question,
                            "parts": [{"type": "text", "text": question}]
                        }
                    ],
                    "userId": "batch-eval-user"
                    # ไม่ส่ง sessionId เพื่อให้ Server สร้าง UUID จริงใน DB มาให้
                }
                
                response = requests.post(API_URL, json=payload, headers=headers, timeout=120)
                
                final_answer = ""
                contexts = []
                
                if response.status_code == 200:
                    try:
                        resp_json = response.json()
                        final_answer = resp_json.get('answer', '')
                        contexts = resp_json.get('contexts', [])
                        

                    except Exception as e:
                        print(f"⚠️ ไม่สามารถ parse response: {e}")
                        final_answer = response.text
                else:
                    print(f"❌ API Error: {response.status_code}")
                    final_answer = "Error: API returned status " + str(response.status_code)

                with open(OUTPUT_FILE, 'a', newline='', encoding='utf-8-sig') as f:
                    writer = csv.writer(f)
                    writer.writerow([question, ground_truth, final_answer, json.dumps(contexts, ensure_ascii=False)])

            except Exception as e:
                print(f"❌ เกิดข้อผิดพลาด: {e}")
            
            time.sleep(DELAY_SECONDS)

    except Exception as e:
        print(f"❌ เกิดข้อผิดพลาดร้ายแรง: {e}")
        return

    print(f"\nเสร็จสิ้น! บันทึกข้อมูลที่: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
