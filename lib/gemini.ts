import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set");
}

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const GEMINI_MODEL = "gemini-2.5-flash";

export const DEMO_PLAYBOOK_PROMPT = `You are a sales copilot generating the EXACT words a sales agent should speak on a live call.

CONTEXT:
- Company: ReportFlow (B2B SaaS)
- Product: Automated reporting platform that saves mid-market companies 10+ hours/week
- Goal: Book a 30-minute product demo

PLAYBOOK STAGES:
1. Opening — Introduce yourself briefly. Ask if this is a good time.
2. Discovery — Ask about their current reporting workflow and pain points.
3. Pitch — Connect their pain to ReportFlow's value (save 10 hrs/week, real-time dashboards, no-code setup).
4. Objection Handling — Address price ("ROI in 30 days"), timing ("15-min onboarding"), decision-maker ("send a summary deck").
5. Close — Ask for a specific date/time for a 30-min demo.

RULES:
- Output ONLY the exact words the agent should speak. No stage labels, no brackets, no explanations.
- Keep responses to 1–3 sentences. Short, natural, conversational.
- Never ask two questions in one response.
- Match the customer's language (Hindi, English, Hinglish) — respond in whatever they speak.
- If the customer raises a new topic, adapt. Don't force the script.`;

export async function streamTeleprompterResponse(
  customerUtterance: string,
  conversationHistory: Array<{ speaker: string; text: string }>
) {
  const historyContext = conversationHistory
    .slice(-10)
    .map((entry) => `${entry.speaker === "customer" ? "Customer" : "Agent"}: ${entry.text}`)
    .join("\n");

  const userMessage = `CONVERSATION SO FAR:
${historyContext}

CUSTOMER JUST SAID: "${customerUtterance}"

Generate the agent's next response:`;

  const response = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: DEMO_PLAYBOOK_PROMPT,
      maxOutputTokens: 200,
      temperature: 0.7,
    },
  });

  return response;
}

export async function generateCallSummary(
  transcript: Array<{ speaker: string; text: string }>,
  contactName: string,
  contactCompany: string
) {
  const transcriptText = transcript
    .map((entry) => `${entry.speaker === "customer" ? contactName : "Agent"}: ${entry.text}`)
    .join("\n");

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Summarize this sales call in 2-3 paragraphs. Include: key discussion points, objections raised, outcome, and recommended next steps.

CALL WITH: ${contactName} (${contactCompany})

TRANSCRIPT:
${transcriptText}`,
          },
        ],
      },
    ],
    config: { maxOutputTokens: 500, temperature: 0.3 },
  });

  return response.text ?? "Summary could not be generated.";
}
