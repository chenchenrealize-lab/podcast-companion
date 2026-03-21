/**
 * DeepSeek API 封装 — 带 ASR 容错与短回答约束
 *
 * 三项回复原则（来自简历）：
 * 1. 优先澄清 — 不延展、不教学，只回答"这个词是什么意思"
 * 2. 默认短回答 — 2-3 句话，15 秒内能说完
 * 3. 不确定时坦诚 — 如果 ASR 置信度低或内容不确定，明确告知
 *
 * ASR 容错第二层：LLM 模糊匹配推断
 * 当 ASR 转写可能有误时，system prompt 会要求 LLM 结合上下文推断用户真正想问的
 */

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

interface AskParams {
  question: string;
  podcastContext: string;
  isLowConfidence?: boolean; // ASR 置信度低的标记
}

export async function askQuestion({
  question,
  podcastContext,
  isLowConfidence = false,
}: AskParams): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === "your_deepseek_api_key_here") {
    throw new Error("请先在 .env.local 中设置 DEEPSEEK_API_KEY");
  }

  // 构造 system prompt
  const systemPrompt = `你是一个播客实时澄清助手。用户正在边听播客边向你提问，你的回答会被转成语音播放。

## 你的核心任务
用户听播客时遇到不懂的术语、人物、背景、缩写，你需要快速澄清让用户能继续听。

## 回复规则（严格遵守）
1. **极短回答**：2-3句话，不超过50个字。用户在听播客，你的回答越短越好。
2. **只做澄清**：用户问"什么是X"就只解释X，不要延展、不要举例、不要教学。
3. **贴合语境**：结合播客当前讨论的内容来解释，不要给通用百科答案。
4. **不确定就说不确定**：如果播客内容中没有足够信息，直接说"播客中没有详细提到这个，简单来说是…"
${isLowConfidence ? '5. **语音识别可能有误**：用户的问题是语音转写的，可能有错别字或听错的词。请结合播客上下文推断用户最可能想问的是什么。如果实在无法确定，请回复"你是想问关于XX的问题吗？"' : ""}

## 回复格式
直接回答，不要加任何前缀（如"好的""让我解释一下"）。不要使用 markdown 格式。`;

  const userContent = `【当前播客内容】
${podcastContext}

【用户提问】${isLowConfidence ? "（语音识别置信度较低，可能有误）" : ""}
${question}`;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3, // 低温度 = 更精准、更短
      max_tokens: 150, // 硬限制：最多 150 token ≈ 50 字中文
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API 错误: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
