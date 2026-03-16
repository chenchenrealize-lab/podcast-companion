"use client";

/**
 * 聊天面板组件
 * 就像微信聊天界面：显示用户的问题和 AI 的回答，一问一答排列
 */
import { useEffect, useRef } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean; // AI 是否正在思考
}

export default function ChatPanel({ messages, isLoading }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新消息出现时自动滚动到底部（就像微信收到新消息自动往下翻）
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        <p>播放播客后，按住下方按钮语音提问 💬</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-2">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            msg.role === "user"
              ? "self-end bg-blue-500 text-white"
              : "self-start bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
          }`}
        >
          {msg.content}
        </div>
      ))}

      {/* AI 思考中的加载动画 */}
      {isLoading && (
        <div className="self-start rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-500 dark:bg-zinc-800">
          <span className="animate-pulse">AI 正在思考...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
