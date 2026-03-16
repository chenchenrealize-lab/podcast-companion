/**
 * Groq Whisper API 封装
 * 用官方 SDK 调用，它会自动处理文件格式和 multipart 细节
 * 就像用官方快递 App 下单，比自己手写快递单靠谱多了
 */
import Groq from "groq-sdk";
import { toFile } from "groq-sdk/uploads";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  // 把浏览器传来的 Blob 转成 Buffer，再用 SDK 的 toFile 包装成正确格式
  const buffer = Buffer.from(await audioBlob.arrayBuffer());
  const file = await toFile(buffer, "audio.webm");

  const transcription = await groq.audio.transcriptions.create({
    file: file,
    model: "whisper-large-v3-turbo",
    language: "zh",
    response_format: "text",
  });

  // response_format 为 text 时，返回的直接是字符串
  return (transcription as unknown as string).trim();
}
