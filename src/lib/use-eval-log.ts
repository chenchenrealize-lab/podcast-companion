"use client";

/**
 * 评估日志 Hook — Step 3
 *
 * 每次问答自动记录完整日志，用于 bad case 归因和面试展示。
 * 日志挂到 window.__evalLogs，可在浏览器 console 中查看/导出。
 *
 * bad case 三类分类（对齐简历）：
 * - context_miss：上下文定位偏差（AI 回答和播客内容对不上）
 * - asr_error：ASR 误传播（语音识别错误导致回答跑偏）
 * - too_long：回复过长（超过 50 字，占用用户太多时间）
 */

import { useCallback, useRef, useEffect } from "react";

// bad case 枚举类型 — 对齐简历的三类归因
export type BadCaseType = "context_miss" | "asr_error" | "too_long" | null;

export interface EvalLogEntry {
  id: number; // 自增序号
  timestamp: string; // ISO 时间戳
  userQuestion: string; // ASR 转写的用户问题
  isLowConfidence: boolean; // ASR 置信度标记
  podcastContext: string; // 当时的播客上下文片段（截取前 200 字）
  aiAnswer: string; // AI 回答全文
  answerLength: number; // 回答字数
  isTooLong: boolean; // 字数 > 50 自动标记
  latency: {
    // 各环节耗时（毫秒）
    asr: number;
    llm: number;
    tts: number;
    total: number;
  };
  ttsPlayDuration: number; // TTS 实际播报时长（毫秒），支撑"平均回复≤15秒"
  badCaseType: BadCaseType; // 三类 bad case，isTooLong 时自动填 'too_long'
}

// 扩展 window 类型，让 TypeScript 认识 __evalLogs
declare global {
  interface Window {
    __evalLogs: EvalLogEntry[];
  }
}

export function useEvalLog() {
  const logsRef = useRef<EvalLogEntry[]>([]);
  const idRef = useRef(0);

  // 挂到 window 上，方便 console 查看
  useEffect(() => {
    window.__evalLogs = logsRef.current;
  }, []);

  const addLog = useCallback(
    (
      entry: Omit<EvalLogEntry, "id" | "timestamp" | "answerLength" | "isTooLong" | "badCaseType">
    ) => {
      const answerLength = entry.aiAnswer.length;
      const isTooLong = answerLength > 50;

      const log: EvalLogEntry = {
        ...entry,
        id: ++idRef.current,
        timestamp: new Date().toISOString(),
        answerLength,
        isTooLong,
        // 超过 50 字自动标记为 too_long，其余留空待手动标记
        badCaseType: isTooLong ? "too_long" : null,
      };

      logsRef.current.push(log);
      window.__evalLogs = logsRef.current;

      // 同时打印到 console，方便实时查看
      console.log(`[EvalLog #${log.id}]`, log);

      return log;
    },
    []
  );

  return { addLog, logs: logsRef };
}
