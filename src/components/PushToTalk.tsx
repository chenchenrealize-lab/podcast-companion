"use client";

/**
 * 按住说话按钮组件
 * 就像对讲机：按住按钮开始录音，松开停止录音并发送
 * 使用浏览器原生的 MediaRecorder API 录音
 */
import { useRef, useState, useCallback } from "react";

interface PushToTalkProps {
  onRecordingComplete: (audioBlob: Blob) => void; // 录音完成后把音频数据交出去
  disabled?: boolean;
}

export default function PushToTalk({
  onRecordingComplete,
  disabled = false,
}: PushToTalkProps) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      chunksRef.current = [];

      // 每产生一段录音数据就存起来
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // 录音停止时，把所有碎片拼成一个完整文件
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        onRecordingComplete(audioBlob);
        // 释放麦克风
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("录音失败:", error);
      alert("无法访问麦克风，请检查浏览器权限设置");
    }
  }, [onRecordingComplete]);

  // 停止录音
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return (
    <button
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      disabled={disabled}
      className={`w-full select-none rounded-2xl px-6 py-5 text-lg font-medium transition-all ${
        disabled
          ? "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
          : isRecording
          ? "scale-95 bg-red-500 text-white shadow-lg shadow-red-500/30"
          : "bg-blue-500 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-95"
      }`}
    >
      {disabled
        ? "⏳ AI 思考中..."
        : isRecording
        ? "🎙️ 正在录音...松开发送"
        : "🎤 按住说话提问"}
    </button>
  );
}
