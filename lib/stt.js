// Speech-to-text via OpenAI's transcription endpoint. Cheap (~$0.003-0.006
// per minute of audio) and needs no separate vendor account beyond OpenAI.
const STT_MODEL = process.env.STT_MODEL || "gpt-4o-mini-transcribe";

// audioBuffer: Buffer/Uint8Array of the recorded audio (webm/mp4/wav/etc)
// filename: used only so OpenAI can infer the format, e.g. "answer.webm"
export async function transcribeAudio(audioBuffer, filename, mimeType) {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mimeType }), filename);
  form.append("model", STT_MODEL);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`OpenAI transcription failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return (data.text || "").trim();
}
