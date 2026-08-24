import type { ResearchAnswer } from "@/lib/research/types";

const EMPTY_ANSWER: ResearchAnswer = {
  answer: "",
  summary: "",
  fact: "",
  analysis: "",
  userThesis: "",
  bullFactors: [],
  bearFactors: [],
  thingsToCheck: [],
  relatedThesis: [],
  suggestResearchNote: false,
  noteDraft: null,
  dataConfidence: "INSUFFICIENT",
};

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "answer",
    "summary",
    "fact",
    "analysis",
    "userThesis",
    "bullFactors",
    "bearFactors",
    "thingsToCheck",
    "relatedThesis",
    "suggestResearchNote",
    "noteDraft",
    "dataConfidence",
  ],
  properties: {
    answer: { type: "string" },
    summary: { type: "string" },
    fact: { type: "string" },
    analysis: { type: "string" },
    userThesis: { type: "string" },
    bullFactors: { type: "array", items: { type: "string" } },
    bearFactors: { type: "array", items: { type: "string" } },
    thingsToCheck: { type: "array", items: { type: "string" } },
    relatedThesis: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "thesisId",
          "impact",
          "impactScore",
          "proposedStatus",
          "proposedSentiment",
          "proposedConfidence",
          "reason",
        ],
        properties: {
          thesisId: { type: "integer" },
          impact: { type: "string", enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] },
          impactScore: { type: "integer" },
          proposedStatus: {
            type: "string",
            enum: ["ACTIVE", "WATCH", "WEAKENING", "BROKEN", ""],
          },
          proposedSentiment: {
            type: "string",
            enum: ["POSITIVE", "NEUTRAL", "NEGATIVE", ""],
          },
          proposedConfidence: { type: "number" },
          reason: { type: "string" },
        },
      },
    },
    suggestResearchNote: { type: "boolean" },
    noteDraft: {
      type: "object",
      additionalProperties: false,
      required: ["title", "newLearnings", "investmentIdea", "thingsToCheck", "tags"],
      properties: {
        title: { type: "string" },
        newLearnings: { type: "array", items: { type: "string" } },
        investmentIdea: { type: "string" },
        thingsToCheck: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
      },
    },
    dataConfidence: {
      type: "string",
      enum: ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"],
    },
  },
};

/**
 * Invoke OpenAI with a strict JSON schema. Returns Korean research answers.
 * @param system - System prompt
 * @param user - User payload
 */
export async function invokeResearchLlm(system: string, user: string): Promise<ResearchAnswer> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 없습니다. web/.env.local에 설정하세요.");
  }
  const model = (process.env.LLM_MODEL || "gpt-4.1-mini").trim();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "research_answer",
          strict: true,
          schema: ANSWER_SCHEMA,
        },
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLM 호출 실패 (${response.status}): ${detail.slice(0, 400)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content || "";
  return parseResearchAnswer(content);
}

/**
 * Parse model JSON into a ResearchAnswer, filling missing fields.
 * @param content - Raw model content
 */
export function parseResearchAnswer(content: string): ResearchAnswer {
  try {
    const parsed = JSON.parse(content) as Partial<ResearchAnswer>;
    return {
      ...EMPTY_ANSWER,
      ...parsed,
      bullFactors: asStringArray(parsed.bullFactors),
      bearFactors: asStringArray(parsed.bearFactors),
      thingsToCheck: asStringArray(parsed.thingsToCheck),
      relatedThesis: Array.isArray(parsed.relatedThesis)
        ? parsed.relatedThesis.map((item) => ({
            ...item,
            proposedStatus: item.proposedStatus || null,
            proposedSentiment: item.proposedSentiment || null,
            proposedConfidence: item.proposedConfidence || null,
          }))
        : [],
      suggestResearchNote: Boolean(parsed.suggestResearchNote),
      noteDraft: parsed.noteDraft?.title ? parsed.noteDraft : null,
      dataConfidence: parsed.dataConfidence || "MEDIUM",
      answer: String(parsed.answer || parsed.summary || ""),
      summary: String(parsed.summary || ""),
      fact: String(parsed.fact || ""),
      analysis: String(parsed.analysis || ""),
      userThesis: String(parsed.userThesis || ""),
    };
  } catch {
    return { ...EMPTY_ANSWER, answer: content, summary: content.slice(0, 280) };
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "")).filter(Boolean);
}
