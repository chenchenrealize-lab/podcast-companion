/**
 * DeepSeek API 封装
 * 把用户的问题和播客上下文发给 DeepSeek，返回 AI 回答
 * 就像请了一个助教：你把课堂笔记和你的问题一起给他，他帮你解答
 */

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

interface AskParams {
  question: string; // 用户的问题
  podcastContext: string; // 播客转录的文本（相当于"课堂笔记"）
}

export async function askQuestion({
  question,
  podcastContext,
}: AskParams): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === "your_deepseek_api_key_here") {
    throw new Error("请先在 .env.local 中设置 DEEPSEEK_API_KEY");
  }

  // 构造 system prompt：告诉 AI 它的角色和任务
  const systemPrompt = `你是一个播客学习助手。用户正在听播客，遇到不懂的地方向你提问。
请根据播客内容回答用户的问题。

要求：
- 用中文回答，简洁明了
- 如果问题与播客内容相关，基于播客内容回答
- 如果播客内容中没有相关信息，诚实说明并给出你的理解
- 回答控制在 3-5 句话以内，因为答案会被转成语音播放`;

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
        {
          role: "user",
          content: `【播客内容摘要】\n${podcastContext}\n\n【我的问题】\n${question}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API 错误: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
