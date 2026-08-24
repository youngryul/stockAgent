import { displaySymbol } from "@/lib/format";
import { RESEARCH_CHAT_RECENT_LIMIT } from "@/lib/research/constants";
import type {
  CompanyPrediction,
  CompanyQuote,
  InvestmentThesis,
  NewsHeadline,
  ResearchJudgment,
  ResearchMessage,
  ResearchNote,
} from "@/lib/research/types";

export const RESEARCH_SYSTEM_PROMPT = `You are a long-horizon company research partner for Korean and US equities.
You help the user study ONE company deeply, keep an investment thesis, and update judgments over months.

Hard rules:
- Always write user-facing text in Korean.
- Do not sycophantically agree. If the user is bullish, still provide bear case, risks, missing data, and alternative interpretations.
- Separate FACT (reported numbers, headlines, filings), AI ANALYSIS (your interpretation), and USER THESIS (the user's current logic). Never mix them.
- If data is missing, say 확인 필요 / 데이터 부족 / 추정 / 가능성. Do not fake precision.
- Prefer this answer shape in "answer": 1) 핵심 결론 2) 근거 3) 긍정 요인 4) 부정 요인 5) 확인해야 할 데이터 6) 현재 투자 Thesis에 미치는 영향.
- Only reference thesisId values that exist in the provided thesis list. If none apply, relatedThesis must be [].
- Set suggestResearchNote true when the dialogue produced a durable insight worth storing.
- If suggestResearchNote is true, fill noteDraft with a concrete Korean title and bullets. Otherwise noteDraft.title may be empty.
- proposedConfidence is 0-1. If you are not proposing a thesis change, use 0 and empty proposedStatus/proposedSentiment.
- Short-term price prediction and long-term company quality can disagree; explain why when both are present.
`;

/**
 * Build compact model context. Do not dump the full chat history.
 */
export function buildResearchUserPayload(input: {
  symbol: string;
  name: string;
  market: string;
  question: string;
  quote: CompanyQuote;
  fundamentals: Record<string, unknown>;
  news: NewsHeadline[];
  prediction: CompanyPrediction;
  theses: InvestmentThesis[];
  notes: ResearchNote[];
  recentMessages: ResearchMessage[];
  judgments: ResearchJudgment[];
}): string {
  const recent = input.recentMessages.slice(-RESEARCH_CHAT_RECENT_LIMIT).map((item) => ({
    role: item.role,
    content: item.content.slice(0, 800),
  }));
  return JSON.stringify(
    {
      company: {
        symbol: input.symbol,
        display: displaySymbol(input.symbol, input.name),
        market: input.market,
      },
      quote: input.quote,
      fundamentals: input.fundamentals,
      news: input.news.slice(0, 5),
      predictionAgent: input.prediction,
      userTheses: input.theses.map((thesis) => ({
        thesisId: thesis.id,
        title: thesis.title,
        description: thesis.description,
        status: thesis.status,
        sentiment: thesis.sentiment,
        confidence: thesis.confidence,
      })),
      relevantNotes: input.notes.map((note) => ({
        id: note.id,
        title: note.title,
        summary: note.summary,
        investmentIdea: note.investmentIdea,
        tags: note.tags,
        createdAt: note.createdAt,
      })),
      userJudgments: input.judgments.slice(0, 5).map((item) => ({
        statement: item.statement,
        rationale: item.rationale,
        priceAtTime: item.priceAtTime,
        createdAt: item.createdAt,
      })),
      recentDialogue: recent,
      currentQuestion: input.question,
    },
    null,
    2,
  );
}
