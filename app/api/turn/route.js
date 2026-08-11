import { transcribeAudio } from "../../../lib/stt";
import { getNextReply } from "../../../lib/llm";
import { synthesizeSpeech } from "../../../lib/tts";
import { finalizeInterview } from "../../../lib/analyze";
import { mockUserAnswer, getMockReply, getMockFinalize } from "../../../lib/mock";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { appendInterviewRow } from "../../../lib/sheets";

export const runtime = "nodejs";

// Set MOCK_MODE=true in your env to test the entire app for free before
// adding any OpenAI billing. Mock mode skips the three PAID calls
// (transcription, chat reply, text-to-speech) and uses canned content
// instead - but Supabase and Google Sheets writes still happen for real,
// so you genuinely verify the full save pipeline works.
const MOCK = process.env.MOCK_MODE === "true";

// One HTTP call = one full turn of the conversation:
//   (optional) child's audio -> transcribe -> add to history
//   -> ask the LLM for the next line -> synthesize it to speech
//   -> if the AI just said goodbye, run final analysis + save it
//
// The server is stateless between turns - the client sends the full
// running `history` each time and gets it back updated.
export async function POST(request) {
  try {
    const form = await request.formData();
    const historyRaw = form.get("history");
    const conversationId = form.get("conversationId") || "";
    const startedAt = form.get("startedAt") || null;
    const audioFile = form.get("audio");

    let history = [];
    try {
      history = historyRaw ? JSON.parse(historyRaw) : [];
    } catch {
      history = [];
    }

    let userText = "";
    let unclear = false;
    if (audioFile && typeof audioFile.arrayBuffer === "function") {
      if (MOCK) {
        const priorUserTurns = history.filter((t) => t.role === "user").length;
        userText = mockUserAnswer(priorUserTurns);
      } else {
        const buffer = Buffer.from(await audioFile.arrayBuffer());
        userText = await transcribeAudio(buffer, audioFile.name || "answer.webm", audioFile.type || "audio/webm");
      }

      // Basic clarity check: if transcription came back empty or nearly
      // empty (mic didn't catch anything usable), don't feed junk into
      // the conversation history - ask the kid to say it again instead.
      if (userText && userText.trim().length >= 2) {
        history = [...history, { role: "user", content: userText }];
      } else {
        unclear = true;
      }
    }

    if (unclear) {
      const replyText = "Sorry, I didn't quite catch that - can you say it one more time?";
      const replyAudioBase64 = MOCK ? null : (await synthesizeSpeech(replyText)).toString("base64");
      return Response.json({ userText: "", replyText, replyAudioBase64, done: false, history, mock: MOCK });
    }

    const { replyText, done } = MOCK ? getMockReply(history) : await getNextReply(history);
    const updatedHistory = [...history, { role: "assistant", content: replyText }];

    // No audio synthesized in mock mode - the client speaks `replyText`
    // aloud with the browser's free built-in speechSynthesis instead.
    const replyAudioBase64 = MOCK ? null : (await synthesizeSpeech(replyText)).toString("base64");

    if (done) {
      const durationSeconds = startedAt
        ? Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
        : null;

      const extracted = MOCK ? getMockFinalize() : await finalizeInterview(updatedHistory);
      const interview = {
        conversation_id: conversationId || `local-${Date.now()}`,
        duration_seconds: durationSeconds,
        full_transcript: updatedHistory,
        ...extracted,
      };

      try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase
          .from("interviews")
          .upsert(interview, { onConflict: "conversation_id" });
        if (error) throw error;
      } catch (err) {
        console.error("Failed to write interview to Supabase:", err);
      }

      try {
        await appendInterviewRow(interview);
      } catch (err) {
        console.error("Failed to append interview to Google Sheet:", err);
      }
    }

    return Response.json({
      userText,
      replyText,
      replyAudioBase64,
      done,
      history: updatedHistory,
      mock: MOCK,
    });
  } catch (err) {
    console.error("Turn processing failed:", err);
    return Response.json({ error: "Something went wrong processing that turn." }, { status: 500 });
  }
}
