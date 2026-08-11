// Reference copy of the fixed interview questions.
//
// IMPORTANT: the AI's actual behavior is controlled by lib/systemPrompt.js,
// NOT by this file. This file exists so:
//   1. You have one place to see/edit the question wording
//   2. lib/analyze.js knows what columns to expect when it
//      writes to Supabase / the Google Sheet
//
// If you change a question here, update lib/systemPrompt.js to match.

export const QUESTIONS = [
  { id: "name", text: "Hey! Before we start - what's your name?" },
  { id: "age", text: "How old are you?" },
  { id: "project", text: "What did you build?" },
  { id: "location", text: "Where in the house did you work - living room, kitchen, garage, your room, or outside?" },
  { id: "first_time", text: "Is this your first project, or have you built with me before?" },
  { id: "tools_source", text: "Did you buy new tools, or did you use tools you already had?" },
  { id: "hardest_tool", text: "What was the most difficult tool to use?" },
  { id: "tricky_part", text: "Was there anything tricky or frustrating?" },
  { id: "explanation_clear", text: "Was the explanation clear enough? Did you understand everything?" },
  { id: "proud", text: "Are you proud of how it turned out?" },
  { id: "next_build", text: "If you could build anything, what would it be?" },
];
