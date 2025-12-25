// ocr-image.ts - แปลงภาพหนังสือการแพทย์เป็นข้อความ (OCR)
// ใช้ Typhoon-OCR ผ่าน Ollama
// Input: data/knowledge_base/image -> Output: data/knowledge_base/txt
// run: npx tsx scripts/ocr-image.ts

import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Ollama } from "@langchain/community/llms/ollama";

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// OCR Model (Typhoon-OCR 1.5 3B)
const ocrModel = new Ollama({
  model: "scb10x/typhoon-ocr1.5-3b:latest",
  baseUrl: "http://localhost:11434",
  temperature: 0,
});

// ประมวลผลภาพ: อ่าน -> ส่ง OCR -> บันทึก .txt
async function processImage(imagePath: string) {
  const fileName = path.basename(imagePath);
  console.log(`\nกำลังประมวลผลภาพ: ${fileName}`);

  try {
    // อ่านไฟล์รูป
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // ส่งให้ Ollama
    console.log('   -> ส่งไป Typhoon OCR...');
    const prompt = `
    You are an expert medical OCR assistant specialized in Thai language.
    Your task is to extract text from this medical handbook page image.

    Context & Accuracy Rules:
    1. **Medical Domain:** The text contains medical terms, disease names, symptoms, and treatments. 
       - Please prioritize accuracy for medical terminology.
       - Ensure symptom descriptions are transcribed accurately.
    2. **Language:** The primary language is Thai.

    Instructions:
    - Return ONLY the clean Markdown content.
    - Do not include any opening/closing remarks or explanations.
    - Preserve the document structure (Headings, Lists, Paragraphs).

    Formatting Rules:
    - **Headers:** Use Markdown headers (#, ##, ###) for topics like "อาการ", "สาเหตุ", "การรักษา".
    - **Tables:** Render tables using <table>...</table> in clean HTML format.
    - **Images/Diagrams:** If there is a medical illustration or chart, describe it briefly in Thai inside:
      <figure>
      [Describe the medical diagram or image content here in Thai]
      </figure>
    - **Page Numbers:**
    - Look carefully at the **top-left, top-right corners** of the image for a page number.
    - Detect page numbers (usually at corners) and wrap them in <page_number>...</page_number>
    `

    const response = await ocrModel.invoke(
      prompt,
      { images: [base64Image] }
    );


    // บันทึกผลลัพธ์
    const outputDir = path.join(process.cwd(), 'data', 'knowledge_base', 'txt');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const outputName = fileName.replace(/\.(png|jpg|jpeg)$/i, '.txt');
    const outputPath = path.join(outputDir, outputName);

    fs.writeFileSync(outputPath, response, 'utf-8');
    console.log(`✅ บันทึกไฟล์: ${outputPath}`);

  } catch (error) {
    console.error(`❌ ประมวลผล ${fileName} ไม่สำเร็จ:`, error);
  }
}

// สแกนไฟล์ PNG/JPG/JPEG แล้วรัน OCR ทีละไฟล์
async function run() {
  const imageSourceDir = path.join(process.cwd(), 'data', 'knowledge_base', 'image');

  if (!fs.existsSync(imageSourceDir)) {
    console.error("❌ ไม่พบโฟลเดอร์ 'data/knowledge_base/image'");
    return;
  }

  const files = fs.readdirSync(imageSourceDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f));

  if (files.length === 0) {
    console.log("❌ ไม่พบไฟล์ภาพใน data/knowledge_base/image");
    return;
  }

  console.log(`📂 พบ ${files.length} ภาพ, เริ่ม OCR...`);

  for (const file of files) {
    await processImage(path.join(imageSourceDir, file));
  }

  console.log("\n✅ เสร็จสิ้น!");
}

run();