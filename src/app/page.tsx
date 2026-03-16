"use client";

/**
 * 主页面 — 播客伴侣的核心界面
 * 布局从上到下：播放器 → 聊天记录 → 提问按钮
 * 就像一个竖屏的对讲机：上面看信息，下面按按钮说话
 *
 * 数据流：
 * 上传 mp3 → 播放器播放
 *        ↓
 * 按住按钮 → 录音 → Groq Whisper 转文字 → 拿到问题
 *        ↓
 * 问题 + 播客上下文 → DeepSeek API → AI 回答 → 显示在聊天面板
 */
import { useState, useRef, useCallback } from "react";
import UploadArea from "@/components/UploadArea";
import AudioPlayer, { AudioPlayerHandle } from "@/components/AudioPlayer";
import PushToTalk from "@/components/PushToTalk";
import ChatPanel, { ChatMessage } from "@/components/ChatPanel";

// Phase 1 硬编码的播客上下文（Phase 2 会换成真实转录）
const DEMO_CONTEXT = `这期播客聊的是人工智能的发展历史。从1950年代图灵测试，到1956年达特茅斯会议正式提出AI概念，到早期的符号推理和专家系统，再到2012年深度学习的突破，以及最近大语言模型的爆发。`;

export default function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const playerRef = useRef<AudioPlayerHandle>(null);

  // 处理录音完成：录音 → 转文字 → AI 回答
  const handleRecordingComplete = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);

      // 1. 暂停播客（就像老师说话时先把电视暂停）
      playerRef.current?.pause();

      try {
        // 2. 把录音发到后端，用 Groq Whisper 转成文字
        const formData = new FormData();
        formData.append("audio", audioBlob);

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const transcribeData = await transcribeRes.json();

        if (!transcribeRes.ok) {
          throw new Error(transcribeData.error || "转录失败");
        }

        const question = transcribeData.text;

        // 把用户问题显示在聊天面板
        setMessages((prev) => [...prev, { role: "user", content: question }]);

        // 3. 把问题和播客上下文发给 AI
        const askRes = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            podcastContext: DEMO_CONTEXT,
          }),
        });
        const askData = await askRes.json();

        if (!askRes.ok) {
          throw new Error(askData.error || "AI 回答失败");
        }

        // 把 AI 回答显示在聊天面板
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: askData.answer },
        ]);
      } catch (error) {
        console.error("处理失败:", error);
        const errorMsg =
          error instanceof Error ? error.message : "处理出错了";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ 出错了：${errorMsg}` },
        ]);
      } finally {
        setIsProcessing(false);
        // Phase 3 会在这里恢复播客播放
      }
    },
    []
  );

  return (
    <div className="flex min-h-dvh flex-col bg-white dark:bg-zinc-950">
      {/* 顶部标题栏 */}
      <header className="flex items-center justify-center border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          🎙️ 播客伴侣
        </h1>
      </header>

      {/* 主内容区 */}
      <main className="flex flex-1 flex-col gap-4 p-4">
        {/* 上传区域 / 播放器 */}
        {!audioFile ? (
          <UploadArea
            onFileSelect={setAudioFile}
            hasFile={!!audioFile}
          />
        ) : (
          <AudioPlayer ref={playerRef} file={audioFile} />
        )}

        {/* 聊天面板 */}
        <ChatPanel messages={messages} isLoading={isProcessing} />
      </main>

      {/* 底部操作区：按住说话 */}
      <footer className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <PushToTalk
          onRecordingComplete={handleRecordingComplete}
          disabled={isProcessing}
        />

        {/* 换音频按钮 */}
        {audioFile && (
          <button
            onClick={() => {
              setAudioFile(null);
              setMessages([]);
            }}
            className="mt-2 w-full text-center text-xs text-zinc-400 hover:text-zinc-600"
          >
            更换播客音频
          </button>
        )}
      </footer>
    </div>
  );
}
