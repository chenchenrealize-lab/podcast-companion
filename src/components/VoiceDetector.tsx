"use client";

/**
 * 语音活动检测（VAD）+ 录音组件
 *
 * 工作原理：
 * 1. 用 Web Audio API 的 AnalyserNode 实时监测音量
 * 2. 音量超过阈值 → 判定为"在说话"，通知父组件暂停播客，开始录音
 * 3. 音量持续低于阈值超过 silenceTimeout → 判定为"说完了"，停止录音
 * 4. 录音 blob 发给父组件，由服务端讯飞 API 做语音识别
 */
import { useRef, useState, useCallback, useEffect } from "react";

interface VoiceDetectorProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onRecordingStart?: () => void; // 开始录音时通知父组件（暂停播客）
  disabled?: boolean;
  isListening: boolean;
  silenceTimeoutOverride?: number | null; // 父组件可动态覆盖静默超时（用于续说信号）
}

// ---- 可调参数 ----
const VOLUME_THRESHOLD = 0.08; // 音量阈值，需要对着麦克风说话才触发
const SILENCE_TIMEOUT = 2500; // 静默多久算"说完了"（ms），从 1.5s 调到 2.5s
// 原因：1.5s 太短，自然语音中间喘气/思考就被截断（bad case: ASR 误传播类）
const MIN_RECORD_DURATION = 800; // 最短录音时长（ms），防止误触
const CHECK_INTERVAL = 100; // 音量检测间隔（ms）

export default function VoiceDetector({
  onRecordingComplete,
  onRecordingStart,
  disabled = false,
  isListening,
  silenceTimeoutOverride = null,
}: VoiceDetectorProps) {
  const [status, setStatus] = useState<
    "idle" | "listening" | "recording" | "disabled"
  >("idle");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStartTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  // 动态静默超时：父组件可通过 silenceTimeoutOverride 临时延长
  const silenceTimeoutValueRef = useRef(SILENCE_TIMEOUT);

  // 同步父组件的超时覆盖值到 ref
  useEffect(() => {
    silenceTimeoutValueRef.current = silenceTimeoutOverride ?? SILENCE_TIMEOUT;
  }, [silenceTimeoutOverride]);

  // 获取当前音量（0~1）
  const getVolume = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }, []);

  // 开始录音
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || isRecordingRef.current) return;

    // 通知父组件：开始录音（父组件会暂停播客）
    onRecordingStart?.();

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
    });
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const duration = Date.now() - recordStartTimeRef.current;
      if (duration < MIN_RECORD_DURATION) {
        return; // 太短，视为误触
      }
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      onRecordingComplete(audioBlob);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    recordStartTimeRef.current = Date.now();
    isRecordingRef.current = true;
    setStatus("recording");
  }, [onRecordingComplete, onRecordingStart]);

  // 停止录音
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    isRecordingRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setStatus("listening");
  }, []);

  // 启动监听
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // 定时检测音量
      checkIntervalRef.current = setInterval(() => {
        if (disabled) return;

        const volume = getVolume();
        const isSpeaking = volume > VOLUME_THRESHOLD;

        if (isSpeaking && !isRecordingRef.current) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          startRecording();
        } else if (isSpeaking && isRecordingRef.current) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (!isSpeaking && isRecordingRef.current) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              stopRecording();
            }, silenceTimeoutValueRef.current); // 用动态值，续说模式下为 5 秒
          }
        }
      }, CHECK_INTERVAL);

      setStatus("listening");
    } catch (error) {
      console.error("麦克风初始化失败:", error);
      setStatus("idle");
    }
  }, [disabled, getVolume, startRecording, stopRecording]);

  // 停止监听
  const stopListening = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    isRecordingRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (isListening && !disabled) {
      startListening();
    } else {
      stopListening();
    }
    return () => stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening, disabled]);

  useEffect(() => {
    if (disabled && isRecordingRef.current) {
      stopRecording();
    }
  }, [disabled, stopRecording]);

  const statusConfig = {
    idle: { color: "bg-zinc-600", ring: "", text: "麦克风未开启", textColor: "text-zinc-500" },
    listening: {
      color: "bg-emerald-400",
      ring: "bg-emerald-400",
      text: "正在听…随时提问",
      textColor: "text-emerald-400/70",
    },
    recording: {
      color: "bg-red-400",
      ring: "bg-red-400",
      text: "录音中…",
      textColor: "text-red-400/70",
    },
    disabled: {
      color: "bg-blue-400",
      ring: "bg-blue-400",
      text: "处理中…",
      textColor: "text-blue-400/70",
    },
  };

  const currentStatus = disabled ? statusConfig.disabled : statusConfig[status];
  const showRing = status === "listening" || status === "recording" || disabled;

  return (
    <div className="flex items-center justify-center gap-2.5 py-3">
      {/* 脉冲环 + 中心圆点 */}
      <div className="relative flex items-center justify-center">
        {showRing && (
          <span className={`absolute h-5 w-5 rounded-full ${currentStatus.ring} opacity-30 animate-pulse-ring`} />
        )}
        <span className={`relative inline-block h-2 w-2 rounded-full ${currentStatus.color}`} />
      </div>
      <span className={`text-[11px] font-medium tracking-wide ${currentStatus.textColor}`}>
        {currentStatus.text}
      </span>
    </div>
  );
}
