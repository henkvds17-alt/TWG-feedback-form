// Text-to-speech via OpenAI's speech endpoint. gpt-4o-mini-tts (unlike the
// older tts-1) accepts an "instructions" field that steers HOW it speaks -
// tone, warmth, pacing - not just WHAT voice. That's what makes this sound
// emotive/friendly instead of flat. Still just a few cents per interview.
// See https://platform.openai.com/docs/guides/text-to-speech for voices.
const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
// "onyx" is OpenAI's deep/warm male voice - matches the "male, natural"
// request. Other male-leaning options if you want to try alternatives:
// "echo" (male, a bit brighter) or "fable" (male, slight accent).
const TTS_VOICE = process.env.TTS_VOICE || "onyx";
// Steers the delivery style. Only honored by gpt-4o-mini-tts (ignored by
// older models) - override via env if you want a different vibe.
const TTS_INSTRUCTIONS =
  process.env.TTS_INSTRUCTIONS ||
  "Speak warmly and cheerfully, like a friendly, encouraging mentor who " +
  "is genuinely excited to hear about a kid's project. Sound upbeat, " +
  "expressive, and animated - not flat or robotic - while staying clear " +
  "and easy for a kid to understand. When the text includes a laugh like " +
  "'Ha!' or 'Haha', let it land as a real, warm chuckle in your voice, " +
  "not a flat reading of the word.";

// Returns a Buffer of mp3 audio for the given text.
export async function synthesizeSpeech(text) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
      instructions: TTS_INSTRUCTIONS,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI TTS failed: ${res.status} ${await res.text()}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
