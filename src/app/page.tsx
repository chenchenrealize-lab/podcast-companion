"use client";

/**
 * 主页面 — 播客理解伙伴
 *
 * 完整交互流程：
 * 1. 用户上传/选择播客 → 开始播放
 * 2. 播放同时：后台实时转写播客音频，构建滑动窗口上下文
 * 3. 用户随时直接说话（VAD 自动检测，无需按按钮）
 * 4. 检测到用户语音 → 自动暂停播客 → 录音 → 讯飞 ASR 转写
 * 5. 提问 + 上下文 → DeepSeek 生成简短回答 → TTS 语音播放回答
 * 6. TTS 播完 → 自动恢复播客播放
 *
 * 核心原则：低打断，语音 in 语音 out
 */
import { useState, useRef, useCallback, useEffect } from "react";
import UploadArea from "@/components/UploadArea";
import AudioPlayer, { AudioPlayerHandle } from "@/components/AudioPlayer";
import VoiceDetector from "@/components/VoiceDetector";
import ChatPanel, { ChatMessage } from "@/components/ChatPanel";
import { useTTS } from "@/lib/use-tts";
import { useLiveTranscript } from "@/lib/use-live-transcript";
import { useEvalLog } from "@/lib/use-eval-log";

// 非语义信号关键词 — 咳嗽、清嗓、语气词等 ASR 可能返回的文本
const NON_SEMANTIC_WORDS = [
  // 语气词
  "嗯", "啊", "呃", "哦", "嗯嗯", "啊啊", "呃呃", "嗯哼", "哈", "嘿",
  "额", "唔", "噢", "哎", "嘛", "呐", "哼", "嗨",
  // 喷嚏/咳嗽的常见 ASR 输出
  "阿七", "阿嚏", "啊七", "啊嚏", "咳", "咳咳", "嗯哼", "啊嗯",
  "哈啊", "嘶", "呼", "啊哈", "哎呀",
];

// 续说信号词 — 用户还没说完，不要截断去问答，继续等
const CONTINUATION_SIGNALS = [
  "等一下", "稍等", "等等", "还没说完", "我想说", "等一等", "别急", "我还没",
];

// Step 5：确认关键词 — AI 回复中包含这些说明是在和用户确认问题
const CONFIRMATION_KEYWORDS = ["你是想问", "你是指", "你说的是", "你是不是在问"];

// ASR 乱码检测 — 同一个字连续重复 3 次以上，判定为 ASR 垃圾输出
// 例如"是是我是我是是我是我是" → 高重复率 → 丢弃
function isGarbledASR(text: string): boolean {
  if (text.length < 4) return false;
  // 统计每个字符出现的次数
  const charCount = new Map<string, number>();
  for (const ch of text) {
    charCount.set(ch, (charCount.get(ch) || 0) + 1);
  }
  // 如果最高频字符占比超过 40%，判定为乱码
  const maxFreq = Math.max(...charCount.values());
  return maxFreq / text.length > 0.4;
}

export default function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeakingAnswer, setIsSpeakingAnswer] = useState(false);
  // Step 4：非语义信号提示（显示 2 秒后自动消失）
  const [nonSemanticHint, setNonSemanticHint] = useState<string | null>(null);
  // 续说模式：检测到"等一下"后，把 VAD 静默超时延长到 5 秒
  const [silenceOverride, setSilenceOverride] = useState<number | null>(null);
  // Step 1：延迟 breakdown 数据
  const [latencyBreakdown, setLatencyBreakdown] = useState<{
    asr: number;
    llm: number;
    tts: number;
    total: number;
  } | null>(null);
  const playerRef = useRef<AudioPlayerHandle>(null);
  const wasPlayingRef = useRef(false);
  const liveTranscriptStartedRef = useRef(false);
  // TTS 播报计时（Step 3: ttsPlayDuration）
  const ttsStartTimeRef = useRef<number>(0);
  const ttsPlayDurationRef = useRef<number>(0);
  // 暂存当次问答数据，等 TTS 播完后写日志
  const pendingLogRef = useRef<{
    question: string;
    isLowConfidence: boolean;
    podcastContext: string;
    answer: string;
    latency: { asr: number; llm: number; tts: number; total: number };
  } | null>(null);

  // Step 5：主动确认交互状态
  // 用 ref 而不是 state，因为回调函数需要读取最新值
  const confirmingRef = useRef(false);
  const confirmContextRef = useRef<{
    originalQuestion: string;
    podcastContext: string;
  } | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmCountdown, setConfirmCountdown] = useState<number | null>(null);

  // 实时转写 hook（播客内容转写，走 Groq）
  const {
    startTranscribing,
    stopTranscribing,
    getContext,
    isTranscribing,
  } = useLiveTranscript();

  // Step 3：评估日志
  const { addLog } = useEvalLog();

  // TTS hook — 回答结束后自动恢复播客 + 记录播报时长
  const { speak, stop: stopTTS } = useTTS({
    rate: 1.2,
    pitch: 0.9,
    onStart: () => {
      setIsSpeakingAnswer(true);
      ttsStartTimeRef.current = Date.now(); // 记录 TTS 开始时间
    },
    onEnd: () => {
      setIsSpeakingAnswer(false);
      // 计算 TTS 实际播报时长
      ttsPlayDurationRef.current = Date.now() - ttsStartTimeRef.current;

      // Step 5：确认模式下，TTS 播完不恢复播客，等用户确认
      if (confirmingRef.current) {
        console.log("[Confirm] TTS 播完确认问题，等待用户回应（5秒）");
        // 启动 5 秒倒计时
        let remaining = 5;
        setConfirmCountdown(remaining);
        const countdownInterval = setInterval(() => {
          remaining--;
          setConfirmCountdown(remaining);
          if (remaining <= 0) clearInterval(countdownInterval);
        }, 1000);

        confirmTimeoutRef.current = setTimeout(() => {
          clearInterval(countdownInterval);
          // 5 秒静默，退出确认模式，恢复播客
          console.log("[Confirm] 5秒无响应，恢复播客");
          confirmingRef.current = false;
          confirmContextRef.current = null;
          setConfirmCountdown(null);
          if (wasPlayingRef.current) {
            playerRef.current?.resume();
            setIsPlaying(true);
          }
        }, 5000);
        return; // 不恢复播客，不写日志（确认问题不算真正回答）
      }

      // Step 3：TTS 播完后写日志（此时才有完整的 ttsPlayDuration）
      if (pendingLogRef.current) {
        addLog({
          userQuestion: pendingLogRef.current.question,
          isLowConfidence: pendingLogRef.current.isLowConfidence,
          podcastContext: pendingLogRef.current.podcastContext.slice(0, 200),
          aiAnswer: pendingLogRef.current.answer,
          latency: pendingLogRef.current.latency,
          ttsPlayDuration: ttsPlayDurationRef.current,
        });
        pendingLogRef.current = null;
      }

      if (wasPlayingRef.current) {
        playerRef.current?.resume();
        setIsPlaying(true);
      }
    },
  });

  // 播客开始播放时，启动实时转写
  const handlePlayStateChange = useCallback(
    (playing: boolean) => {
      setIsPlaying(playing);
      if (playing && !liveTranscriptStartedRef.current) {
        const audioEl = playerRef.current?.getAudioElement();
        if (audioEl) {
          try {
            startTranscribing(audioEl);
            liveTranscriptStartedRef.current = true;
          } catch (e) {
            console.error("启动实时转写失败:", e);
          }
        }
      }
    },
    [startTranscribing]
  );

  // 检测到用户开始说话 → 立即暂停播客
  const handleRecordingStart = useCallback(() => {
    // Step 5：确认模式下，播客已经暂停，不更新 wasPlayingRef
    if (confirmingRef.current) {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
      setConfirmCountdown(null);
      return;
    }
    // 只要有音频文件就标记为"需要恢复"
    // 修复：之前用 isPlaying() 判断，但 resume() 是异步的，
    // 连续提问时可能读到 false，导致回答完不恢复播客
    wasPlayingRef.current = !!audioFile;
    playerRef.current?.pause();
    setIsPlaying(false);
  }, [audioFile]);

  // 录音完成 → 讯飞转写 → AI 回答 → TTS 播放
  const handleRecordingComplete = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);
      const t0 = Date.now(); // Step 1：计时起点

      try {
        // 1. 发给讯飞 ASR 转写
        const formData = new FormData();
        formData.append("audio", audioBlob);

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const transcribeData = await transcribeRes.json();
        const t1 = Date.now(); // ASR 完成

        if (!transcribeRes.ok) {
          throw new Error(transcribeData.error || "转录失败");
        }

        const question = (transcribeData.text || "").trim();
        const isLowConfidence = transcribeData.isLowConfidence || false;

        // Step 4：判断是否为非语义信号（空文本 或 纯语气词）
        const isNonSemantic =
          !question || NON_SEMANTIC_WORDS.includes(question);

        if (isNonSemantic) {
          // 非语义信号处理：不暂停播客，不进 LLM，只做音量渐降提示
          console.log(`[NonSemantic] 检测到非语义信号: "${question || "(空)"}"`);

          // 如果播客之前在播放，恢复并做音量渐降效果
          if (wasPlayingRef.current) {
            playerRef.current?.resume();
            setIsPlaying(true);
            // 音量 0.5 秒降到 50% → 保持 1.5 秒 → 0.5 秒升回 100%
            playerRef.current?.fadeVolume(0.5, 500);
            setTimeout(() => playerRef.current?.fadeVolume(1.0, 500), 2000);
          }

          // 页面提示（2 秒后消失）
          setNonSemanticHint("检测到非语义信号，继续播放");
          setTimeout(() => setNonSemanticHint(null), 2000);

          // Step 3 联动：非语义信号也记日志
          addLog({
            userQuestion: question || "(空音频)",
            isLowConfidence,
            podcastContext: "",
            aiAnswer: "(非语义信号，未进入问答)",
            latency: { asr: t1 - t0, llm: 0, tts: 0, total: t1 - t0 },
            ttsPlayDuration: 0,
          });
          return;
        }

        // ASR 乱码检测 — "是是我是我是..." 这类重复字符垃圾
        if (isGarbledASR(question)) {
          console.log(`[Garbled] ASR 乱码丢弃: "${question}"`);
          setNonSemanticHint("语音识别异常，请再说一次");
          setTimeout(() => setNonSemanticHint(null), 3000);
          // 恢复播客播放（之前暂停了）
          if (wasPlayingRef.current) {
            playerRef.current?.resume();
            setIsPlaying(true);
          }
          addLog({
            userQuestion: question,
            isLowConfidence: true,
            podcastContext: "",
            aiAnswer: "(ASR 乱码，已丢弃)",
            latency: { asr: t1 - t0, llm: 0, tts: 0, total: t1 - t0 },
            ttsPlayDuration: 0,
          });
          return;
        }

        // 续说信号检测 — 用户说了"等一下"之类的
        const matchedSignal = CONTINUATION_SIGNALS.find((s) =>
          question.includes(s)
        );

        if (matchedSignal) {
          // 剥离信号词后，看剩余内容是否有实质问题
          const remaining = question.replace(matchedSignal, "").trim();

          if (remaining.length < 5) {
            // 纯信号词（如"等一下"、"稍等一下"）→ 延长超时，等用户继续说
            console.log(`[Continuation] 用户还没说完: "${question}"，延长超时到 5 秒`);
            setNonSemanticHint("收到，请继续说…");
            setTimeout(() => setNonSemanticHint(null), 5000);
            // 把 VAD 静默超时延长到 5 秒，给用户充足时间组织语言
            setSilenceOverride(5000);
            return;
          }
          // 信号词 + 实质内容（如"等一下什么是 attention"）→ 用剩余内容继续问答
          console.log(`[Continuation] 剥离信号词后继续处理: "${remaining}"`);
        }

        // 如果之前在续说模式，用户这次正常说话了，重置超时
        if (silenceOverride !== null) {
          setSilenceOverride(null);
        }

        // 显示用户问题
        setMessages((prev) => [...prev, { role: "user", content: question }]);

        // 2. 获取实时上下文
        // Step 5：确认模式下使用原始上下文，而不是当前（可能已经变了）
        let podcastContext: string;
        let finalQuestion: string;

        if (confirmingRef.current && confirmContextRef.current) {
          // 二轮对话：把原始问题 + 用户确认合并发给 LLM
          podcastContext = confirmContextRef.current.podcastContext;
          finalQuestion = `用户之前的问题是"${confirmContextRef.current.originalQuestion}"（语音识别不确定），用户的补充确认是"${question}"，请综合判断并回答。`;
          console.log(`[Confirm] 二轮对话：原始问题="${confirmContextRef.current.originalQuestion}"，确认="${question}"`);
        } else {
          podcastContext = getContext();
          finalQuestion = question;
        }

        // 3. 发给 DeepSeek AI
        const askRes = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: finalQuestion,
            podcastContext,
            isLowConfidence: confirmingRef.current ? false : isLowConfidence,
          }),
        });
        const askData = await askRes.json();
        const t2 = Date.now(); // LLM 完成

        if (!askRes.ok) {
          throw new Error(askData.error || "AI 回答失败");
        }

        // Step 1：记录延迟 breakdown
        const t3 = Date.now(); // TTS 即将启动
        const breakdown = {
          asr: t1 - t0,
          llm: t2 - t1,
          tts: t3 - t2, // TTS 启动耗时（极小，主要是 JS 执行）
          total: t3 - t0,
        };
        setLatencyBreakdown(breakdown);
        console.log(`[Latency] ASR: ${breakdown.asr}ms | LLM: ${breakdown.llm}ms | Total: ${breakdown.total}ms`);

        // 显示 AI 回答
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: askData.answer },
        ]);

        // Step 5：检测 AI 是否在主动确认（而非直接回答）
        const isConfirmation =
          !confirmingRef.current && // 已经在确认模式中就不再嵌套
          CONFIRMATION_KEYWORDS.some((kw) => askData.answer.includes(kw));

        if (isConfirmation) {
          // 进入确认模式：TTS 播完后不恢复播客，等用户回应
          console.log("[Confirm] AI 正在确认用户问题，进入确认模式");
          confirmingRef.current = true;
          confirmContextRef.current = {
            originalQuestion: question,
            podcastContext,
          };
          // 确认阶段不记日志，等真正回答后再记
        } else {
          // 正常回答：确认模式结束（如果之前在确认中）
          confirmingRef.current = false;
          confirmContextRef.current = null;

          // Step 3：暂存日志数据，等 TTS 播完后写入（那时才有 ttsPlayDuration）
          pendingLogRef.current = {
            question,
            isLowConfidence,
            podcastContext,
            answer: askData.answer,
            latency: breakdown,
          };
        }

        // 4. TTS 语音播放（播完自动恢复播客）
        speak(askData.answer);
      } catch (error) {
        console.error("处理失败:", error);
        const errorMsg =
          error instanceof Error ? error.message : "处理出错了";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `出错了：${errorMsg}` },
        ]);
        if (wasPlayingRef.current) {
          playerRef.current?.resume();
          setIsPlaying(true);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [getContext, speak, addLog, silenceOverride]
  );

  useEffect(() => {
    return () => {
      stopTranscribing();
      stopTTS();
    };
  }, [stopTranscribing, stopTTS]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#0b0f1a]">
      {/* 顶部标题栏 — 毛玻璃效果 */}
      <header className="sticky top-0 z-10 flex items-center justify-center px-4 py-4 glass">
        <h1 className="text-lg font-semibold tracking-wide text-gradient">
          Podcast Buddy
        </h1>
        {audioFile && isTranscribing && (
          <span className="absolute right-4 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-[10px] text-emerald-400/70 font-medium">LIVE</span>
          </span>
        )}
      </header>

      {/* 主内容区 */}
      <main className="flex flex-1 flex-col gap-3 p-4 pb-0">
        {!audioFile ? (
          <UploadArea onFileSelect={setAudioFile} hasFile={!!audioFile} />
        ) : (
          <AudioPlayer
            ref={playerRef}
            file={audioFile}
            onTimeUpdate={() => {
              const playing = playerRef.current?.isPlaying() ?? false;
              if (playing !== isPlaying) {
                handlePlayStateChange(playing);
              }
            }}
          />
        )}

        <ChatPanel messages={messages} isLoading={isProcessing} />
      </main>

      {/* 底部控制栏 — 毛玻璃效果 */}
      <footer className="sticky bottom-0 px-4 pt-2 pb-4 glass">
        <VoiceDetector
          onRecordingComplete={handleRecordingComplete}
          onRecordingStart={handleRecordingStart}
          disabled={isProcessing || isSpeakingAnswer}
          isListening={!!audioFile}
          silenceTimeoutOverride={silenceOverride}
        />

        {/* 状态提示区 */}
        <div className="flex flex-col items-center gap-1">
          {isSpeakingAnswer && (
            <div className="flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              <span className="text-[11px] text-blue-400 font-medium">助手正在回答</span>
            </div>
          )}

          {confirmCountdown !== null && (
            <div className="flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              <span className="text-[11px] text-amber-400 font-medium">
                等待确认…{confirmCountdown}s
              </span>
            </div>
          )}

          {nonSemanticHint && (
            <div className="rounded-full bg-white/5 px-3 py-1">
              <span className="text-[11px] text-zinc-400">{nonSemanticHint}</span>
            </div>
          )}

          {latencyBreakdown && (
            <div className="text-[10px] text-zinc-500 font-mono tracking-wider">
              ASR {latencyBreakdown.asr}ms · LLM {latencyBreakdown.llm}ms · Total {latencyBreakdown.total}ms
            </div>
          )}
        </div>

        {audioFile && (
          <button
            onClick={() => {
              stopTranscribing();
              stopTTS();
              liveTranscriptStartedRef.current = false;
              if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
              confirmingRef.current = false;
              confirmContextRef.current = null;
              setConfirmCountdown(null);
              setSilenceOverride(null);
              setAudioFile(null);
              setMessages([]);
              setIsPlaying(false);
              setLatencyBreakdown(null);
            }}
            className="mt-2 w-full text-center text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            更换播客
          </button>
        )}
      </footer>
    </div>
  );
}
