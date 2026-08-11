// Runs once, when the interview ends: reads the full transcript and
// extracts everything Henk wants saved, in one cheap JSON-mode LLM call.
// This replaces what ElevenLabs' "data collection" dashboard feature used
// to do - now it's plain code, so it's free to change and doesn't depend
// on an external dashboard config.

const MODEL = process.env.ANALYSIS_MODEL || "gpt-4o-mini";

function transcriptToText(history) {
  return history
    .map((turn) => `${turn.role === "assistant" ? "The Woodworking Guy" : "Child"}: ${turn.content}`)
    .join("\n");
}

const INSTRUCTIONS = `You are analyzing a transcript of a short spoken interview between
"The Woodworking Guy" (an AI voice agent) and a child who just completed a woodworking project.

Read the transcript and respond with ONLY a JSON object (no markdown fences, no extra text) with
these exact keys:

{
  "project_name": "the project the child says they built, best guess from context if unclear",
  "favorite_part": "short summary of what they said was their favorite part, or 'Not mentioned'",
  "tricky_part": "short summary of what was tricky/hard/frustrating, or 'Nothing mentioned'",
  "what_youd_change": "short summary of what they'd do differently next time, or 'Nothing mentioned'",
  "pride_level": "the child's own description of how proud they are, in their words/a short paraphrase",
  "would_build_again": true or false (best judgment from what they said),
  "would_build_again_reason": "short reason why or why not",
  "summary": "2-3 sentence plain-English summary of the whole interview",
  "key_insights": "2-4 short points (single string, newline separated) most useful for Henk to know",
  "improvement_suggestions": "concrete suggestions for improving the project/kit/instructions based on what the child said, or 'None identified.'",
  "overall_sentiment": "one word: positive, neutral, or negative"
}`;

export async function finalizeInterview(history) {
  const transcriptText = transcriptToText(history);

  const empty = {
    project_name: "",
    favorite_part: "",
    tricky_part: "",
    what_youd_change: "",
    pride_level: "",
    would_build_again: null,
    would_build_again_reason: "",
    summary: "",
    key_insights: "",
    improvement_suggestions: "",
    overall_sentiment: "neutral",
  };

  if (!transcriptText.trim()) return empty;

  let rawText;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: `${INSTRUCTIONS}\n\nTranscript:\n${transcriptText}` }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    rawText = data.choices?.[0]?.message?.content ?? "{}";
  } catch (err) {
    console.error("finalizeInterview LLM call failed:", err);
    return empty;
  }

  try {
    const parsed = JSON.parse(rawText);
    return { ...empty, ...parsed };
  } catch (err) {
    console.error("Failed to parse finalize JSON:", err, rawText);
    return { ...empty, summary: rawText.slice(0, 500) };
  }
}
