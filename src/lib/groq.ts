/**
 * Groq Whisper API 封装
 * 把音频文件发给 Groq 的 Whisper 模型，返回转录文字
 * 就像把一段录音交给速记员，速记员听完后把内容写成文字还给你
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your_groq_api_key_here") {
    throw new Error("请先在 .env.local 中设置 GROQ_API_KEY");
  }

  // 把 Blob 转成带文件名的 File 对象（Groq 需要知道文件名和类型）
  const arrayBuffer = await audioBlob.arrayBuffer();
  const file = new File([arrayBuffer], "audio.webm", { type: "audio/webm" });

  // 用原生 Web API 的 FormData（Vercel 服务器原生支持）
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("language", "zh");
  formData.append("response_format", "text");

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API 错误: ${response.status} - ${error}`);
  }

  const text = await response.text();
  return text.trim();
}
