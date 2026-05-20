# evaluate_ragas.py - ประเมินผล RAG ด้วย Ragas
# Metrics: Answer Relevancy, Context Precision, Context Recall
# run: python scripts/evaluate_ragas.py

import pandas as pd
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
import os
# === OLLAMA MODE (ใช้ Local) ===
from langchain_community.chat_models import ChatOllama
from langchain_community.embeddings import OllamaEmbeddings
from datasets import Dataset
from ragas.run_config import RunConfig

from dotenv import load_dotenv

# Load ENV
load_dotenv(os.path.join(os.getcwd(), '.env.local'))

# ==========================================
# ส่วนที่ 1: การตั้งค่า (Configuration)
# ==========================================
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL_NAME = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "bge-m3")

# === จำนวนคำถามที่จะประเมิน ===
SAMPLE_LIMIT = 100  # จำนวนคำถามทั้งหมดที่จะประเมิน (None = ทั้งหมด)
BATCH_SIZE = 25     # แบ่งประเมินทีละกี่ข้อ

# ==========================================
# ส่วนที่ 2: ฟังก์ชันโหลดข้อมูล
# ==========================================
# ฟังก์ชันนี้เอาไว้แปลง context ที่เป็น string ให้กลายเป็น list
def parse_context(x):
    if pd.isna(x) or x == "":
        return []
    s = str(x).strip()
    if not s:
        return []
    if isinstance(x, list):
        return [str(item) for item in x]
    if s.startswith('[') and s.endswith(']'):
        try:
            import ast
            result = ast.literal_eval(s)
            if isinstance(result, list):
                return [str(item).strip() for item in result if str(item).strip()]
        except (ValueError, SyntaxError):
            pass
    # fallback: แบ่งด้วยตัวคั่นที่ใช้ในระบบ
    parts = s.split('\n\n---\n\n')
    return [part.strip() for part in parts if part.strip()]

# โหลดข้อมูลจากไฟล์ ragas_evaluation.csv 
def load_data():
    data_path = os.path.join(os.getcwd(), 'data', 'evaluation', 'ragas_evaluation.csv')

    if not os.path.exists(data_path):
        print(f"❌ ไม่พบไฟล์ข้อมูลที่: {data_path}")
        print("   กรุณารัน 'python scripts/batch_answer.py' เพื่อสร้างข้อมูลก่อน")
        return None

    print(f"📂 กำลังอ่านไฟล์ข้อมูล: {data_path}")
    
    # อ่าน CSV
    try:
        df = pd.read_csv(data_path)
    except Exception as e:
        print(f"❌ อ่านไฟล์ CSV ไม่สำเร็จ: {e}")
        return None

    # ตรวจสอบคอลัมน์
    required_cols = ['question', 'answer', 'contexts', 'ground_truth']
    for col in required_cols:
        if col not in df.columns:
            # ถ้าไม่มี ground_truth ให้เติมว่าง
            if col == 'ground_truth':
                df['ground_truth'] = ""
            else:
                print(f"❌ ขาดคอลัมน์ที่จำเป็น: {col}")
                return None

    # การจัดการทำความสะอาดข้อความ
    def process_contexts(row):
        ctx_str = str(row['contexts'])
        answer_str = str(row['answer'])
        
        # 1. ถ้ามี context มาแบบ JSON list
        if ctx_str.strip() and ctx_str != "[]":
            result = parse_context(ctx_str)
            if result: return result

        # 2. ถ้า context ว่าง ให้ลองแกะจาก answer
        extracted_ctx = []
        if "ข้อมูลจากเอกสาร:" in answer_str:
            parts = answer_str.split("ข้อมูลจากเอกสาร:")
            if len(parts) > 1:
                extracted_ctx.append(parts[1].strip())
        
        return extracted_ctx

    df['contexts'] = df.apply(process_contexts, axis=1)
    df['ground_truth'] = df['ground_truth'].fillna("").astype(str)
    df['answer'] = df['answer'].fillna("").astype(str)

    # กรองแถวที่ไม่มีคำตอบ
    df = df[df['answer'].str.strip() != ""]
    
    return df

# ==========================================
# ส่วนที่ 3: ฟังก์ชันประมวลผล (Evaluation)
# ==========================================
# 1. โหลดข้อมูล -> 2. แบ่ง batch -> 3. ประเมินทีละ batch -> 4. รวมผลและ save

def run_evaluation():
    print("\nเริ่มต้นระบบประเมินผล Ragas.")
    
    df = load_data()
    if df is None or df.empty:
        print("❌ ไม่มีข้อมูลสำหรับประเมินผล")
        return

    print(f"📊 จำนวนข้อมูลทั้งหมด: {len(df)} รายการ")
    
    # จำกัดจำนวนข้อมูล (ถ้าตั้งค่าไว้)
    if SAMPLE_LIMIT and SAMPLE_LIMIT < len(df):
        df = df.head(SAMPLE_LIMIT)  # ใช้ head แทน sample เพื่อความสม่ำเสมอ
        print(f"❌ จำกัดการประเมินที่ {SAMPLE_LIMIT} คำถาม")

    # ตรวจสอบว่ามี contexts ที่ไม่ว่างจริงหรือไม่
    has_valid_contexts = df['contexts'].apply(lambda x: len(x) > 0).any()
    has_ground_truth = ('ground_truth' in df.columns) and (df['ground_truth'].str.strip() != "").any()

    # เลือก Metrics ที่จะใช้วัดผล
    print("✅ ใช้ metric: Faithfulness และ Answer Relevancy")
    metrics = [faithfulness, answer_relevancy]

    if has_ground_truth and has_valid_contexts:
        metrics.extend([context_precision, context_recall])
        print("✅ เพิ่ม Context Precision และ Context Recall")
    else:
        if not has_ground_truth:
            print("ℹ️ ไม่มีข้อมูลเฉลย — ข้าม Context Precision/Recall")
        if not has_valid_contexts:
            print("ℹ️ contexts ว่าง — ข้าม Context Precision/Recall")

    # ตั้งค่า LLM และ Embeddings
    print(f"เชื่อมต่อกับ Ollama ({MODEL_NAME})...")
    llm = ChatOllama(model=MODEL_NAME, base_url=OLLAMA_BASE_URL, request_timeout=300.0)
    embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL, base_url=OLLAMA_BASE_URL)
    run_config = RunConfig(timeout=600, max_retries=5, max_wait=120)
    
    # เตรียม directory สำหรับ save
    report_dir = os.path.join(os.getcwd(), 'data', 'report')
    os.makedirs(report_dir, exist_ok=True)
    
    # แบ่งข้อมูลเป็น batches
    total_rows = len(df)
    num_batches = (total_rows + BATCH_SIZE - 1) // BATCH_SIZE
    all_results = []
    
    print(f"\n📦 แบ่งเป็น {num_batches} batch(s), ทีละ {BATCH_SIZE} ข้อ")
    print("=" * 50)
    
    for batch_num in range(num_batches):
        start_idx = batch_num * BATCH_SIZE
        end_idx = min(start_idx + BATCH_SIZE, total_rows)
        
        batch_df = df.iloc[start_idx:end_idx].copy()
        batch_dataset = Dataset.from_pandas(batch_df)
        
        print(f"\n🔄 Batch {batch_num + 1}/{num_batches} (ข้อ {start_idx + 1} - {end_idx})")
        
        try:
            results = evaluate(
                dataset=batch_dataset,
                metrics=metrics,
                llm=llm,
                embeddings=embeddings,
                run_config=run_config
            )
            
            # แปลงผลลัพธ์เป็น DataFrame
            batch_results_df = results.to_pandas()
            all_results.append(batch_results_df)
            
            # Save ผลทีละ batch กันข้อมูลหาย
            batch_path = os.path.join(report_dir, f'ragas_batch_{batch_num + 1}.csv')
            batch_results_df.to_csv(batch_path, index=False, encoding='utf-8-sig')
            print(f"   ✅ Batch {batch_num + 1} เสร็จสิ้น - บันทึกที่: {batch_path}")
            
            # แสดงคะแนนเฉลี่ยของ batch นี้
            print(f"   📊 คะแนนเฉลี่ย batch นี้:")
            for col in batch_results_df.columns:
                if col not in ['question', 'answer', 'contexts', 'ground_truth']:
                    avg = batch_results_df[col].mean()
                    if pd.notna(avg):
                        print(f"      - {col}: {avg:.4f}")
            
        except Exception as e:
            print(f"   ❌ Batch {batch_num + 1} เกิดข้อผิดพลาด: {e}")
            print("   ❌ ข้าม batch นี้ไป ดำเนินการต่อ...")
            continue
    
    # รวมผลทั้งหมด
    if all_results:
        print("\n" + "=" * 50)
        print("📈 รวมผลลัพธ์ทั้งหมด...")
        
        final_df = pd.concat(all_results, ignore_index=True)
        final_path = os.path.join(report_dir, 'ragas_evaluation_report.csv')
        final_df.to_csv(final_path, index=False, encoding='utf-8-sig')
        
        print(f"\n✅ ประเมินเสร็จสิ้น {len(final_df)} ข้อ")
        print(f"💾 บันทึกรายงานรวมที่: {final_path}")
        
        # แสดงคะแนนเฉลี่ยรวม
        print("\n📊 คะแนนเฉลี่ยรวม")
        for col in final_df.columns:
            if col not in ['question', 'answer', 'contexts', 'ground_truth']:
                avg = final_df[col].mean()
                if pd.notna(avg):
                    print(f"   - {col}: {avg:.4f}")
    else:
        print("\n❌ ไม่มีผลลัพธ์ที่สามารถประมวลผลได้")

if __name__ == "__main__":
    run_evaluation()