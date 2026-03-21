/**
 * 讯飞语音听写（流式版）API 封装
 *
 * 工作流程：
 * 1. 接收前端发来的音频 Blob（webm/opus 格式）
 * 2. 用 ffmpeg 转成 PCM 16kHz 16-bit mono
 * 3. 通过 WebSocket 快速发给讯飞
 * 4. 收集讯飞返回的识别结果，拼接成完整文本
 * 5. 返回文本
 */

import { createHmac } from "crypto";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";
import WebSocket from "ws";

// ffmpeg 路径：用 resolve 获取绝对路径，避免 Next.js 运行时路径解析问题
const FFMPEG_PATH = resolve(
  process.cwd(),
  "node_modules",
  "ffmpeg-static",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
);

const XFYUN_HOST = "iat-api.xfyun.cn";
const XFYUN_PATH = "/v2/iat";

/**
 * 生成讯飞 WebSocket 认证 URL
 */
function getAuthUrl(): string {
  const apiKey = process.env.XFYUN_API_KEY;
  const apiSecret = process.env.XFYUN_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("请在 .env.local 中设置 XFYUN_API_KEY 和 XFYUN_API_SECRET");
  }

  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${XFYUN_HOST}\ndate: ${date}\nGET ${XFYUN_PATH} HTTP/1.1`;

  const signature = createHmac("sha256", apiSecret)
    .update(signatureOrigin)
    .digest("base64");

  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");

  return `wss://${XFYUN_HOST}${XFYUN_PATH}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${XFYUN_HOST}`;
}

/**
 * 把 webm/opus 音频转成 PCM 16kHz 16-bit mono
 */
function convertToPCM(inputBuffer: Buffer): Buffer {
  const inputFile = join(tmpdir(), `xfyun-input-${Date.now()}.webm`);
  const outputFile = join(tmpdir(), `xfyun-output-${Date.now()}.pcm`);

  writeFileSync(inputFile, inputBuffer);

  try {
    execFileSync(FFMPEG_PATH, [
      "-i", inputFile,
      "-ar", "16000",
      "-ac", "1",
      "-f", "s16le",
      "-y",
      outputFile,
    ], { timeout: 10000 });

    return readFileSync(outputFile);
  } finally {
    try { unlinkSync(inputFile); } catch { /* ignore */ }
    try { unlinkSync(outputFile); } catch { /* ignore */ }
  }
}

/**
 * 从讯飞返回的 JSON 中提取文本
 */
function extractText(resultData: {
  result?: {
    ws?: Array<{
      cw?: Array<{ w?: string }>;
    }>;
  };
}): string {
  if (!resultData.result?.ws) return "";
  return resultData.result.ws
    .map((item) => item.cw?.map((cw) => cw.w || "").join("") || "")
    .join("");
}

/**
 * 主函数：转写音频 → 返回文本
 */
export async function transcribeWithXfyun(
  audioBlob: Blob
): Promise<{ text: string; isLowConfidence: boolean }> {
  const appId = process.env.XFYUN_APP_ID;
  if (!appId) {
    throw new Error("请在 .env.local 中设置 XFYUN_APP_ID");
  }

  const inputBuffer = Buffer.from(await audioBlob.arrayBuffer());
  console.log("[讯飞] 音频大小:", inputBuffer.length, "bytes");

  const pcmBuffer = convertToPCM(inputBuffer);
  console.log("[讯飞] PCM 大小:", pcmBuffer.length, "bytes");

  const url = getAuthUrl();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const allTexts: string[] = [];
    let timeout: ReturnType<typeof setTimeout>;

    timeout = setTimeout(() => {
      ws.close();
      resolve({ text: allTexts.join(""), isLowConfidence: true });
    }, 10000);

    ws.on("open", () => {
      console.log("[讯飞] WebSocket 已连接，快速发送音频...");

      const frameSize = 1280; // 每帧 1280 bytes
      const totalFrames = Math.ceil(pcmBuffer.length / frameSize);

      // 快速发送所有帧，不等 40ms 间隔
      for (let i = 0; i < totalFrames; i++) {
        const start = i * frameSize;
        const end = Math.min(start + frameSize, pcmBuffer.length);
        const chunk = pcmBuffer.subarray(start, end);
        const audioBase64 = chunk.toString("base64");

        if (i === 0) {
          // 第一帧：包含 common 和 business 参数
          ws.send(JSON.stringify({
            common: { app_id: appId },
            business: {
              language: "zh_cn",
              domain: "iat",
              accent: "mandarin",
              vad_eos: 1500,  // 静默检测 1.5 秒
              dwa: "wpgs",
              ptt: 0,
            },
            data: {
              status: 0,
              format: "audio/L16;rate=16000",
              encoding: "raw",
              audio: audioBase64,
            },
          }));
        } else {
          ws.send(JSON.stringify({
            data: {
              status: 1,
              format: "audio/L16;rate=16000",
              encoding: "raw",
              audio: audioBase64,
            },
          }));
        }
      }

      // 发送结束帧
      ws.send(JSON.stringify({
        data: {
          status: 2,
          format: "audio/L16;rate=16000",
          encoding: "raw",
          audio: "",
        },
      }));

      console.log("[讯飞] 音频发送完毕，共", totalFrames, "帧");
    });

    ws.on("message", (data: Buffer | string) => {
      const msg = JSON.parse(data.toString());

      if (msg.code !== 0) {
        console.error("[讯飞] 错误:", msg.code, msg.message);
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`讯飞 API 错误: ${msg.message}`));
        return;
      }

      if (msg.data?.result) {
        const text = extractText(msg.data);
        if (text) {
          allTexts.push(text);
        }
      }

      if (msg.data?.status === 2) {
        clearTimeout(timeout);
        ws.close();
        const finalText = allTexts.join("");
        console.log("[讯飞] 识别结果:", finalText);
        resolve({
          text: finalText,
          isLowConfidence: finalText.length < 2,
        });
      }
    });

    ws.on("error", (err) => {
      console.error("[讯飞] WebSocket 错误:", err);
      clearTimeout(timeout);
      reject(new Error("讯飞语音识别连接失败"));
    });

    ws.on("close", () => {
      clearTimeout(timeout);
    });
  });
}
