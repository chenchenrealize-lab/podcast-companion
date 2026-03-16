/**
 * AI 问答 API
 * 接收用户的问题，结合播客上下文，调用 DeepSeek 生成回答
 * 就像一个智能助教：你把问题和课堂笔记给他，他帮你解答
 */
import { NextRequest, NextResponse } from "next/server";
import { askQuestion } from "@/lib/deepseek";

export async function POST(request: NextRequest) {
  try {
    const { question, podcastContext } = await request.json();

    if (!question) {
      return NextResponse.json({ error: "请输入问题" }, { status: 400 });
    }

    // 调用 DeepSeek 回答问题
    const answer = await askQuestion({
      question,
      podcastContext: podcastContext || "（暂无播客内容）",
    });

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("问答失败:", error);
    const message =
      error instanceof Error ? error.message : "AI 问答服务出错了";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
