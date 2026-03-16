"use client";

/**
 * 上传音频区域组件
 * 就像一个收件箱：用户把 mp3 文件拖进来或点击选择，我们接收并传给播放器
 */
import { useCallback, useState } from "react";

interface UploadAreaProps {
  onFileSelect: (file: File) => void; // 文件选好后通知父组件
  hasFile: boolean; // 是否已经选了文件
}

export default function UploadArea({ onFileSelect, hasFile }: UploadAreaProps) {
  const [loadingDemo, setLoadingDemo] = useState(false);

  // 加载示例音频（把服务器上的 demo 文件下载下来，伪装成用户上传的文件）
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

  // 处理文件选择（无论是拖拽还是点击）
  const handleFile = useCallback(
    (file: File) => {
      // 只接受音频文件
      if (!file.type.startsWith("audio/")) {
        alert("请选择音频文件（mp3, wav 等）");
        return;
      }
      onFileSelect(file);
    },
    [onFileSelect]
  );

  // 拖拽放下时触发
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  if (hasFile) return null; // 已经有文件了就不显示上传区域

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 p-12 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50 dark:border-zinc-700 dark:hover:border-blue-500 dark:hover:bg-blue-950/20"
    >
      {/* 上传图标 */}
      <div className="mb-4 text-5xl">🎙️</div>
      <p className="mb-2 text-lg font-medium text-zinc-700 dark:text-zinc-300">
        拖拽播客音频到这里
      </p>
      <p className="mb-4 text-sm text-zinc-500">或者点击下方按钮选择文件</p>
      <label className="cursor-pointer rounded-full bg-blue-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600">
        选择音频文件
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
      <p className="mt-3 text-xs text-zinc-400">支持 mp3, wav, m4a 等格式</p>

      {/* 分割线 */}
      <div className="my-4 flex w-full items-center gap-3">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        <span className="text-xs text-zinc-400">或者</span>
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
      </div>

      {/* 试用示例音频 */}
      <button
        onClick={loadDemo}
        disabled={loadingDemo}
        className="rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        {loadingDemo ? "加载中..." : "🎧 试听示例播客"}
      </button>
    </div>
  );
}
