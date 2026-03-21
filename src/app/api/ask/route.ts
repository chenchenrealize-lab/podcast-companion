/**
 * AI 问答 API
 * 接收用户问题 + 播客上下文 + ASR 置信度 → DeepSeek 生成简短澄清回答
 */
import { NextRequest, NextResponse } from "next/server";
import { askQuestion } from "@/lib/deepseek";

export async function POST(request: NextRequest) {
  try {
    const { question, podcastContext, isLowConfidence } = await request.json();

    if (!question) {
      return NextResponse.json({ error: "请输入问题" }, { status: 400 });
    }

    const answer = await askQuestion({
      question,
      podcastContext: podcastContext || "（暂无播客内容）",
      isLowConfidence: isLowConfidence || false,
    });

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("问答失败:", error);
    const message =
      error instanceof Error ? error.message : "AI 问答服务出错了";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
