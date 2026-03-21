"use client";

/**
 * 实时播客转写 Hook
 *
 * 工作原理：
 * 1. 用 Web Audio API 的 MediaElementSource 从 <audio> 元素捕获音频流
 * 2. 用 MediaRecorder 每 SEGMENT_DURATION 秒截取一段
 * 3. 把每段发给 /api/transcribe 做 ASR
 * 4. 转写结果存入滑动窗口，维护最近 N 段作为上下文
 *
 * 这样 AI 回答问题时，拿到的是"用户当前正在听的内容"而不是硬编码文本
 */

import { useRef, useCallback, useState } from "react";

// ---- 可调参数 ----
const SEGMENT_DURATION = 30000; // 每段录制时长（ms），30秒一段（减少 API 请求避免限流）
const MAX_SEGMENTS = 6; // 最多保留段数，6 × 30s = 最近 3 分钟
// 渐进递减权重 — 越近的段权重越高，AI 优先参考最近内容
const SEGMENT_WEIGHTS = [0.2, 0.3, 0.4, 0.6, 0.8, 1.0]; // 从旧到新

export interface TranscriptSegment {
  text: string;
  timestamp: number; // 播客中的时间点（秒）
  weight: number;
}

export function useLiveTranscript() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // 发送一段音频去转写
  const transcribeSegment = useCallback(
    async (blob: Blob, currentTime: number) => {
      try {
        const formData = new FormData();
        formData.append("audio", blob);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) return;

        const data = await res.json();
        const text = data.text?.trim();
        if (!text) return;

        setSegments((prev) => {
          const newSegment: TranscriptSegment = {
            text,
            timestamp: currentTime,
            weight: 1.0, // 临时值，下面会重新计算
          };

          const all = [...prev, newSegment];

          // 滑动窗口：只保留最近 MAX_SEGMENTS 段
          const trimmed =
            all.length > MAX_SEGMENTS
              ? all.slice(all.length - MAX_SEGMENTS)
              : all;

          // 按位置分配渐进递减权重（从旧到新）
          return trimmed.map((s, i) => ({
            ...s,
            weight: SEGMENT_WEIGHTS[Math.max(0, SEGMENT_WEIGHTS.length - trimmed.length + i)],
          }));
        });
      } catch (err) {
        console.error("转写段落失败:", err);
      }
    },
    []
  );

  // 开始录制并定时截段
  const startSegmentRecording = useCallback(() => {
    const dest = destNodeRef.current;
    if (!dest) return;

    const recorder = new MediaRecorder(dest.stream, {
      mimeType: "audio/webm;codecs=opus",
    });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const currentTime = audioElementRef.current?.currentTime ?? 0;
        transcribeSegment(blob, currentTime);
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();

    // 每 SEGMENT_DURATION 停一次，触发转写，再重新开始
    intervalRef.current = setInterval(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
      // 重新开始新一段
      const newRecorder = new MediaRecorder(dest.stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      chunksRef.current = [];
      newRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      newRecorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const ct = audioElementRef.current?.currentTime ?? 0;
          transcribeSegment(blob, ct);
        }
      };
      mediaRecorderRef.current = newRecorder;
      newRecorder.start();
    }, SEGMENT_DURATION);
  }, [transcribeSegment]);

  // 连接到 audio 元素并开始转写
  const startTranscribing = useCallback(
    (audioElement: HTMLAudioElement) => {
      if (audioContextRef.current) return; // 已经在转写了

      audioElementRef.current = audioElement;

      const audioContext = new AudioContext();
      // 注意：一个 audio 元素只能创建一次 MediaElementSource
      const source = audioContext.createMediaElementSource(audioElement);
      const dest = audioContext.createMediaStreamDestination();

      // 音频同时输出到扬声器和录制器
      source.connect(audioContext.destination); // 扬声器
      source.connect(dest); // 录制

      audioContextRef.current = audioContext;
      sourceNodeRef.current = source;
      destNodeRef.current = dest;

      setIsTranscribing(true);
      startSegmentRecording();
    },
    [startSegmentRecording]
  );

  // 停止转写
  const stopTranscribing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    // 不关闭 AudioContext，因为 MediaElementSource 只能创建一次
    setIsTranscribing(false);
  }, []);

  // 获取当前上下文（拼接所有段落，按距离加权标注）
  const getContext = useCallback((): string => {
    if (segments.length === 0) {
      return "（播客刚开始播放，暂无转写内容）";
    }

    const header =
      "以下是播客实时转写内容，按时间远近排列，权重递减，请优先参考最近的内容：\n";

    const body = segments
      .map((s, i) => {
        const timeLabel = getTimeLabel(i, segments.length);
        return `【${timeLabel} | 权重 ${s.weight.toFixed(1)}】${s.text}`;
      })
      .join("\n");

    return header + body;
  }, [segments]);

  return {
    startTranscribing,
    stopTranscribing,
    getContext,
    segments,
    isTranscribing,
  };
}

// 根据段落位置生成时间标签（从最旧到最新）
function getTimeLabel(index: number, total: number): string {
  const distFromEnd = total - 1 - index; // 距离最新段的距离
  if (distFromEnd === 0) return "最近 30 秒";
  if (distFromEnd === 1) return "约 1 分钟前";
  return `约 ${distFromEnd} 分钟前`;
}
