/**
 * 转录文本滑动窗口管理
 * 就像一个有限长度的笔记本：新内容写在最后，如果笔记本满了就撕掉最前面的页
 * 这样我们始终保持最近一段时间的播客内容作为 AI 的上下文
 */

// Phase 1 硬编码的示例播客内容（Phase 2 会替换成真实转录）
const DEMO_TRANSCRIPT = `
这期播客我们聊聊人工智能的发展历史。
最早的人工智能概念可以追溯到1950年代，图灵提出了著名的图灵测试。
所谓图灵测试，就是说如果一台机器能让人类无法分辨它是机器还是人类，那它就算有了智能。
后来在1956年的达特茅斯会议上，"人工智能"这个词正式被提出。
早期的AI研究主要集中在符号推理和专家系统上，就是人类把规则一条一条写进去。
但这种方法遇到了瓶颈，因为现实世界太复杂了，你没法把所有规则都写出来。
直到深度学习的出现，特别是2012年 AlexNet 在图像识别上的突破，AI 才真正开始爆发。
深度学习的核心思想是让机器自己从数据中学习规律，而不是人类手动编写规则。
最近几年大语言模型的发展更是让人惊叹，从 GPT 到 Claude，AI 已经能理解和生成自然语言了。
`.trim();

export class TranscriptStore {
  private segments: string[] = [];
  private maxSegments: number;

  // maxSegments = 20 意味着保留最近 20 个片段（每个约 30 秒 ≈ 10 分钟）
  constructor(maxSegments: number = 20) {
    this.maxSegments = maxSegments;
  }

  // 添加一段新的转录文本
  addSegment(text: string) {
    this.segments.push(text);
    // 如果超过上限，删掉最早的（就像滑动窗口往前移）
    if (this.segments.length > this.maxSegments) {
      this.segments.shift();
    }
  }

  // 获取当前所有上下文，拼接成一段完整文本
  getContext(): string {
    if (this.segments.length === 0) {
      return DEMO_TRANSCRIPT; // Phase 1：没有真实转录时用示例内容
    }
    return this.segments.join("\n");
  }

  // 清空所有转录
  clear() {
    this.segments = [];
  }
}

// 全局单例（整个应用共享一个转录存储）
// 注意：Vercel Serverless 环境下每次冷启动会重置，Phase 2 会把状态移到前端
export const globalTranscriptStore = new TranscriptStore();
