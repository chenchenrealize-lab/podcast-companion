/**
 * Groq Whisper API 封装
 * 把音频文件发给 Groq 的 Whisper 模型，返回转录文字
 * 就像把一段录音交给速记员，速记员听完后把内容写成文字还给你
 */
import FormData from "form-data";

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your_groq_api_key_here") {
    throw new Error("请先在 .env.local 中设置 GROQ_API_KEY");
  }

  // 把浏览器传来的 Blob 转成 Buffer（就像把电子文件打印成纸质版，换一种格式方便寄送）
  const arrayBuffer = await audioBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 用 form-data 包构造表单（关键：它会自动生成正确的 boundary 标记）
  // boundary 就像快递单上的条形码，告诉接收方"从哪里开始、到哪里结束"
  const formData = new FormData();
  formData.append("file", buffer, {
    filename: "audio.webm",
    contentType: "audio/webm",
  });
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("language", "zh"); // 优先识别中文
  formData.append("response_format", "text");

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...formData.getHeaders(), // 关键！包含 Content-Type 和 boundary
    },
    body: formData as unknown as BodyInit,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API 错误: ${response.status} - ${error}`);
  }

  const text = await response.text();
  return text.trim();
}
