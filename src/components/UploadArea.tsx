"use client";

import { useCallback, useState } from "react";

interface UploadAreaProps {
  onFileSelect: (file: File) => void;
  hasFile: boolean;
}

export default function UploadArea({ onFileSelect, hasFile }: UploadAreaProps) {
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const loadDemo = useCallback(async () => {
    setLoadingDemo(true);
    try {
      const res = await fetch("/demo.m4a");
      const blob = await res.blob();
      const file = new File([blob], "示例播客.m4a", { type: "audio/mp4" });
      onFileSelect(file);
    } catch {
      alert("加载示例音频失败");
    } finally {
      setLoadingDemo(false);
    }
  }, [onFileSelect]);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("audio/")) {
        alert("请选择音频文件（mp3, wav 等）");
        return;
      }
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  if (hasFile) return null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      {/* 主上传区域 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        className={`w-full max-w-sm rounded-3xl border-2 border-dashed p-10 text-center transition-all duration-300 ${
          isDragging
            ? "border-blue-400 bg-blue-500/5 scale-[1.02]"
            : "border-white/10 hover:border-white/20"
        }`}
      >
        {/* 图标 */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
          <svg className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </div>

        <p className="mb-1 text-sm font-medium text-white/80">
          拖拽音频文件到这里
        </p>
        <p className="mb-5 text-xs text-zinc-500">
          支持 mp3, wav, m4a 等格式
        </p>

        <label className="inline-block cursor-pointer rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]">
          选择文件
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      </div>

      {/* 分割线 */}
      <div className="my-5 flex w-full max-w-sm items-center gap-4">
        <div className="h-px flex-1 bg-white/5" />
        <span className="text-[11px] text-zinc-600 uppercase tracking-widest">or</span>
        <div className="h-px flex-1 bg-white/5" />
      </div>

      {/* 示例播客按钮 */}
      <button
        onClick={loadDemo}
        disabled={loadingDemo}
        className="rounded-full border border-white/10 px-6 py-2.5 text-sm font-medium text-zinc-400 transition-all hover:border-white/20 hover:text-white hover:bg-white/5 active:scale-[0.98]"
      >
        {loadingDemo ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            加载中
          </span>
        ) : "试听示例播客"}
      </button>
    </div>
  );
}
