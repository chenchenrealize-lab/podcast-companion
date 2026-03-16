/**
 * 语音转文字 API
 * 接收前端发来的音频文件，调用 Groq Whisper 转成文字
 * 就像一个翻译窗口：你递进去一段录音，翻译员还你一段文字
 */
import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/groq";

export async function POST(request: NextRequest) {
  try {
    // 从请求中取出音频文件
    const formData = await request.formData();
    const audioFile = formData.get("audio") as Blob | null;

    if (!audioFile) {
      return NextResponse.json({ error: "没有收到音频文件" }, { status: 400 });
    }

    // 调用 Groq Whisper 转录
    const text = await transcribeAudio(audioFile);

    return NextResponse.json({ text });
  } catch (error) {
    console.error("转录失败:", error);
    const message =
      error instanceof Error ? error.message : "转录服务出错了";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
