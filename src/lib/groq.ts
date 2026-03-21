/**
 * Groq Whisper API 封装 — 带三层容错
 *
 * 容错机制：
 * 1. 热词表注入：通过 prompt 参数注入常见术语，提高识别准确率
 * 2. LLM 模糊匹配推断：转写结果中的疑似错误由 LLM 修正（在 ask 环节处理）
 * 3. 不确定时主动确认：置信度低时标记，让 LLM 回答时声明不确定
 *
 * 注意：使用 curl 调用 Groq API，因为 Node.js 24 的 fetch/FormData/groq-sdk
 * 发送 multipart 文件给 Groq 都会触发 403 Forbidden（Cloudflare TLS 检测问题）
 */

import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ---- 热词表 ----
const HOT_WORDS = [
  "GPT", "Claude", "OpenAI", "Anthropic", "DeepSeek", "LLM",
  "Transformer", "BERT", "AlexNet", "ImageNet", "ResNet",
  "fine-tuning", "RLHF", "token", "embedding", "attention mechanism",
  "neural network", "deep learning", "machine learning",
  "reinforcement learning", "backpropagation",
  "Elon Musk", "Sam Altman", "Demis Hassabis", "Yann LeCun",
  "Geoffrey Hinton", "Andrej Karpathy", "Ilya Sutskever",
  "Dario Amodei", "Fei-Fei Li",
  "Google DeepMind", "Meta AI", "Microsoft Research",
  "Nvidia", "TSMC", "Y Combinator",
  "ARR", "MRR", "PMF", "product-market fit", "Series A",
  "venture capital", "IPO", "valuation",
  "大语言模型", "图灵测试", "达特茅斯", "梯度下降", "反向传播",
  "注意力机制", "微调", "强化学习", "人类反馈强化学习",
];

const WHISPER_PROMPT = HOT_WORDS.join(", ");
const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * 用 curl 调用 Groq Whisper API
 */
function callGroqWhisper(
  audioBuffer: Buffer,
  responseFormat: string,
  language?: string
): string {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("请先在 .env.local 中设置 GROQ_API_KEY");
  }

  const tmpFile = join(tmpdir(), `groq-audio-${Date.now()}.webm`);
  writeFileSync(tmpFile, audioBuffer);

  try {
    const args = [
      "-s",
      GROQ_API_URL,
      "-H", `Authorization: Bearer ${apiKey}`,
      "-F", `file=@${tmpFile}`,
      "-F", `model=whisper-large-v3-turbo`,
      "-F", `response_format=${responseFormat}`,
      "-F", `prompt=${WHISPER_PROMPT}`,
    ];

    if (language) {
      args.push("-F", `language=${language}`);
    }

    const result = execFileSync("curl", args, {
      encoding: "utf8",
      timeout: 30000,
    });

    return result;
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * 转写音频（用户提问）— 返回文本 + 置信度标记
 * 用 text 格式获取文本（最稳定），置信度通过文本长度和内容简单判断
 */
export async function transcribeAudio(
  audioBlob: Blob,
  language?: string
): Promise<{ text: string; isLowConfidence: boolean }> {
  const buffer = Buffer.from(await audioBlob.arrayBuffer());
  console.log("[Groq] 用户提问音频大小:", buffer.length, "bytes");

  const raw = callGroqWhisper(buffer, "text", language || "zh");
  console.log("[Groq] 原始返回:", raw.substring(0, 200));

  // 检查是否是错误响应（JSON 格式的错误）
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.includes('"error"')) {
    console.error("[Groq] API 返回错误:", trimmed);
    throw new Error("语音识别服务暂时不可用，请稍后再试");
  }

  const text = trimmed;
  console.log("[Groq] 转写结果:", text || "(空)");

  // 简单判断置信度：文本太短可能是噪音
  const isLowConfidence = text.length < 3;

  return { text, isLowConfidence };
}

/**
 * 转写播客音频段（用于实时上下文构建）
 */
export async function transcribePodcastSegment(
  audioBlob: Blob
): Promise<string> {
  const buffer = Buffer.from(await audioBlob.arrayBuffer());

  try {
    const raw = callGroqWhisper(buffer, "text");
    const trimmed = raw.trim();

    // 检查是否是错误响应
    if (trimmed.startsWith("{") && trimmed.includes('"error"')) {
      console.error("[Groq] 播客转写错误:", trimmed);
      return "";
    }

    return trimmed;
  } catch (err) {
    console.error("[Groq] 播客转写失败:", err);
    return "";
  }
}
