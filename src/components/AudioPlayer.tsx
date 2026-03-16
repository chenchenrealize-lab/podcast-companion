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

    return (
      <div className="rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-900">
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

        {/* 文件名 */}
        <p className="mb-3 truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
          🎧 {file.name}
        </p>

        {/* 进度条 */}
        <div
          className="mb-2 h-2 cursor-pointer rounded-full bg-zinc-300 dark:bg-zinc-700"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
        </div>

        {/* 时间 + 播放按钮 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <button
            onClick={togglePlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600"
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
        </div>
      </div>
    );
  }
);

export default AudioPlayer;
