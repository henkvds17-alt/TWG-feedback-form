// Zero-cost stand-ins for the real OpenAI calls, used when MOCK_MODE=true.
// Lets you click through the ENTIRE app - recording, playback, the
// Supabase row, the Google Sheet row - without spending a cent, before
// you've added any OpenAI billing at all.
//
// IMPORTANT - what mock mode does and doesn't prove:
//   - It does NOT transcribe what you actually said. Real speech-to-text
//     is one of the three paid calls, so mock mode skips it entirely and
//     substitutes a canned line instead. This is by design, not a bug -
//     if it "can't hear you" while MOCK_MODE=true, that's expected.
//   - It DOES exercise the real Supabase write and the real Google Sheets
//     write, so a successful mock run proves that part of the pipeline
//     genuinely works. The row you'll see is placeholder content, though
//     (clearly marked "(mock)") - not a reflection of anything you said.
//   - To get real transcription, a real conversation, and a Sheet row
//     that reflects what was actually said, set MOCK_MODE=false and add
//     OPENAI_API_KEY.

import { QUESTIONS } from "./questions";

const MOCK_ANSWERS = [
  "(mock) My name is Alex.",
  "(mock) I built a little birdhouse.",
  "(mock) The best part was painting it at the end.",
  "(mock) Getting the corners straight was pretty tricky.",
  "(mock) Maybe I'd sand it down more next time.",
  "(mock) I'm pretty proud of it, honestly.",
  "(mock) Yeah, I'd want to build something else!",
];

export function mockUserAnswer(turnIndex) {
  return MOCK_ANSWERS[turnIndex % MOCK_ANSWERS.length];
}

// A few natural-sounding acknowledgements to rotate through, so repeated
// test runs don't feel like the same robotic line every time.
const ACKNOWLEDGEMENTS = [
  "Nice, I like that.",
  "That's a great answer.",
  "Love that.",
  "Good to know!",
  "Ha, fair enough.",
];

// Mirrors the shape/signature of lib/llm.js's getNextReply(history)
export function getMockReply(history) {
  const assistantTurns = history.filter((t) => t.role === "assistant").length;

  if (assistantTurns === 0) {
    return {
      replyText: `Hey there! I'm The Woodworking Guy - quick heads up, this is MOCK MODE so I'm not really listening yet. ${QUESTIONS[0].text}`,
      done: false,
    };
  }

  if (assistantTurns < QUESTIONS.length) {
    const ack = ACKNOWLEDGEMENTS[(assistantTurns - 1) % ACKNOWLEDGEMENTS.length];
    return {
      replyText: `(mock) ${ack} Next up: ${QUESTIONS[assistantTurns].text}`,
      done: false,
    };
  }

  return {
    replyText: "(mock) Thanks so much for chatting! That wraps up this test interview - check Supabase and your Sheet for the saved row.",
    done: true,
  };
}

// Mirrors lib/analyze.js's finalizeInterview(history)
export function getMockFinalize() {
  return {
    project_name: "(mock) Birdhouse",
    favorite_part: "(mock) Painting it at the end",
    tricky_part: "(mock) Getting the corners straight",
    what_youd_change: "(mock) Sand it down more next time",
    pride_level: "(mock) Pretty proud, honestly",
    would_build_again: true,
    would_build_again_reason: "(mock) Said yes to building something else",
    summary: "This is a MOCK interview generated with no real AI calls - it proves the Supabase and Google Sheets pipeline works, but none of this reflects real speech. Turn off MOCK_MODE and add an OpenAI key for real interviews.",
    key_insights: "Mock data - not real feedback.\nSafe to delete this row.",
    improvement_suggestions: "None - this is a test run, not a real answer.",
    overall_sentiment: "positive",
  };
}
