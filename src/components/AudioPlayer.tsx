"use client";

/**
 * 播客播放器组件
 * 就像手机上的音乐播放器：显示进度条，可以播放/暂停
 * 关键功能：外部可以控制暂停和恢复（用户提问时暂停，AI回答完恢复）
 */
import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

// 暴露给父组件的控制方法（就像遥控器上的按钮）
export interface AudioPlayerHandle {
  pause: () => void;   // 暂停播放
  resume: () => void;  // 恢复播放
  isPlaying: () => boolean;
  getAudioElement: () => HTMLAudioElement | null; // 获取 audio 元素（用于实时转写）
  fadeVolume: (target: number, duration: number) => void; // 平滑过渡音量（0-1）
}

interface AudioPlayerProps {
  file: File;
  onTimeUpdate?: (currentTime: number) => void; // 播放进度变化时通知
}

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  function AudioPlayer({ file, onTimeUpdate }, ref) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string>("");

    // 文件变化时，创建可播放的 URL（就像把 CD 放进播放器）
    useEffect(() => {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url); // 组件卸载时清理
    }, [file]);

    // 把控制方法暴露给父组件
    useImperativeHandle(ref, () => ({
      pause: () => {
        audioRef.current?.pause();
        setIsPlaying(false);
      },
      resume: () => {
        audioRef.current?.play();
        setIsPlaying(true);
      },
      isPlaying: () => isPlaying,
      getAudioElement: () => audioRef.current,
      // 平滑音量过渡 — 用 requestAnimationFrame 做线性插值
      // 就像音响旋钮慢慢转，而不是啪一下跳到目标音量
      fadeVolume: (target: number, duration: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        const startVolume = audio.volume;
        const startTime = performance.now();
        const tick = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          audio.volume = startVolume + (target - startVolume) * progress;
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
    }));

    // 播放/暂停切换
    const togglePlay = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    }, [isPlaying]);

    // 进度条点击跳转
    const handleSeek = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        audio.currentTime = ratio * duration;
      },
      [duration]
    );

    // 格式化时间：秒 → "分:秒" 格式
    const formatTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const progress = duration ? (currentTime / duration) * 100 : 0;

    return (
      <div className="glass rounded-2xl p-4">
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={() => {
            const t = audioRef.current?.currentTime ?? 0;
            setCurrentTime(t);
            onTimeUpdate?.(t);
          }}
          onLoadedMetadata={() => {
            setDuration(audioRef.current?.duration ?? 0);
          }}
          onEnded={() => setIsPlaying(false)}
        />

        {/* 标题行 */}
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
            <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white/90">
              {file.name.replace(/\.[^.]+$/, "")}
            </p>
            <p className="text-[11px] text-zinc-500">
              {formatTime(currentTime)} / {formatTime(duration)}
            </p>
          </div>
          {/* 播放按钮 */}
          <button
            onClick={togglePlay}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/20 transition-all hover:shadow-blue-500/40 hover:scale-105 active:scale-95"
          >
            {isPlaying ? (
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>

        {/* 进度条 */}
        <div
          className="group relative h-1.5 cursor-pointer rounded-full bg-white/5 transition-all hover:h-2"
          onClick={handleSeek}
        >
          {/* 已播放部分 */}
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
            style={{ width: `${progress}%` }}
          />
          {/* 拖拽圆点 */}
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-md opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
      </div>
    );
  }
);

export default AudioPlayer;
