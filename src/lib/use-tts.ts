"use client";

/**
 * TTS 语音播放 hook
 * 用浏览器内置 SpeechSynthesis API 将文字转语音播放
 *
 * 参数按简历要求设定：
 * - 语速 1.2 倍（比正常稍快，减少占用时间）
 * - 语调平稳低情感（pitch 略低）
 * - 音色尽量选择与播客不同的声音
 */

import { useCallback, useRef } from "react";

interface TTSOptions {
  rate?: number; // 语速，1.0 为正常，简历要求 1.2
  pitch?: number; // 音调，1.0 为正常，低情感用 0.9
  onStart?: () => void;
  onEnd?: () => void;
}

export function useTTS(options: TTSOptions = {}) {
  const { rate = 1.2, pitch = 0.9, onStart, onEnd } = options;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(
    (text: string) => {
      // 如果还在说，先停掉
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 1.0;

      // 尝试选一个中文女声（与常见播客男声区分）
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(
        (v) =>
          v.lang.startsWith("zh") &&
          (v.name.includes("female") ||
            v.name.includes("Ting") ||
            v.name.includes("Meijia") ||
            v.name.includes("Google") ||
            v.name.includes("Microsoft"))
      );
      if (zhVoice) utterance.voice = zhVoice;

      utterance.onstart = () => onStart?.();
      utterance.onend = () => onEnd?.();
      utterance.onerror = () => onEnd?.();

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [rate, pitch, onStart, onEnd]
  );

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  return { speak, stop };
}
