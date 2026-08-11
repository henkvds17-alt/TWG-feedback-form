import { SYSTEM_PROMPT, COMPLETE_TOKEN } from "./systemPrompt";

// Cheap model choice on purpose - this is a short, simple, well-scoped
// conversation. A frontier model is overkill and costs far more per call.
const MODEL = process.env.CONVERSATION_MODEL || "gpt-4o-mini";

// history: array of { role: "user" | "assistant", content: string }
// Returns { replyText, done } - done=true once the AI has said its
// goodbye (detected via the sentinel token, stripped before returning).
export async function getNextReply(history) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.8,
      // Kept short on purpose - shorter replies mean less time waiting on
      // both the chat call AND the TTS call after it (Henk: "thinking
      // very long"). The system prompt already asks for short replies;
      // this is a hard ceiling as backup.
      max_tokens: 90,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI chat completion failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  let text = data.choices?.[0]?.message?.content?.trim() || "";

  const done = text.includes(COMPLETE_TOKEN);
  if (done) {
    text = text.replace(COMPLETE_TOKEN, "").trim();
  }

  return { replyText: text, done };
}
