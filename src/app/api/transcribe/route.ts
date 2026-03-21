/**
 * 语音转文字 API
 * 接收前端发来的音频文件，调用讯飞语音听写 API 转成文字
 * 讯飞优势：国内服务器无网络问题、中英混合识别好、速度快
 */
import { NextRequest, NextResponse } from "next/server";
import { transcribeWithXfyun } from "@/lib/xfyun";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as Blob | null;

    if (!audioFile) {
      return NextResponse.json({ error: "没有收到音频文件" }, { status: 400 });
    }

    const { text, isLowConfidence } = await transcribeWithXfyun(audioFile);

    return NextResponse.json({ text, isLowConfidence });
  } catch (error) {
    console.error("转录失败:", error);
    const message =
      error instanceof Error ? error.message : "转录服务出错了";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
