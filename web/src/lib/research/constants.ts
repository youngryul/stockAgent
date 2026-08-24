import type { ThesisSentiment, ThesisStatus } from "@/lib/research/types";

export const THESIS_STATUS_LABELS: Record<ThesisStatus, string> = {
  ACTIVE: "유효",
  WATCH: "확인 필요",
  WEAKENING: "약화",
  BROKEN: "깨짐",
};

export const SENTIMENT_LABELS: Record<ThesisSentiment, string> = {
  POSITIVE: "긍정",
  NEUTRAL: "중립",
  NEGATIVE: "부정",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  NEWS: "뉴스",
  EARNINGS: "실적",
  DISCLOSURE: "공시",
  PRICE: "가격",
  USER_NOTE: "노트",
  THESIS_CHANGE: "Thesis 변화",
  AI_ANALYSIS: "AI 분석",
  USER_THESIS: "투자 논리",
  STUDY: "공부",
};

export const NOTIFICATION_TYPES = {
  THESIS_EVENT: "THESIS_EVENT",
  EARNINGS: "EARNINGS",
  THESIS_CONFIDENCE: "THESIS_CONFIDENCE",
  STUDY_STALE: "STUDY_STALE",
  NEWS_IMPACT: "NEWS_IMPACT",
} as const;

export const RESEARCH_CHAT_RECENT_LIMIT = 8;
export const RESEARCH_NOTE_SEARCH_LIMIT = 5;
export const STUDY_STALE_DAYS = 30;

/** Fallback curriculum if study_topics has not been migrated yet. */
export const DEFAULT_STUDY_TOPICS = [
  {
    category: "business",
    title: "회사가 어떻게 돈을 버는지",
    prompt:
      "이 회사가 어떻게 돈을 버는지 핵심 수익원을 단계적으로 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 1,
  },
  {
    category: "business",
    title: "주요 사업부",
    prompt:
      "주요 사업부를 나누고 각 사업이 전체에서 차지하는 역할을 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 2,
  },
  {
    category: "financials",
    title: "매출 구조",
    prompt: "매출 구조를 제품/지역/고객 관점에서 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 3,
  },
  {
    category: "financials",
    title: "영업이익 구조",
    prompt:
      "영업이익이 어디서 나고 무엇이 마진을 좌우하는지 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 4,
  },
  {
    category: "financials",
    title: "최근 5년 실적",
    prompt:
      "최근 실적 추세를 성장, 수익성, 변동성 관점으로 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 5,
  },
  {
    category: "competition",
    title: "경쟁사",
    prompt: "핵심 경쟁사와 경쟁 구도를 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 6,
  },
  {
    category: "competition",
    title: "시장 점유율",
    prompt:
      "시장 점유율과 점유율 변화의 투자 의미를 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 7,
  },
  {
    category: "governance",
    title: "경영진",
    prompt:
      "경영진과 자본 배분 스타일이 투자에 어떤 의미가 있는지 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 8,
  },
  {
    category: "growth",
    title: "CAPEX",
    prompt:
      "CAPEX 규모와 방향이 미래 이익에 주는 영향을 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 9,
  },
  {
    category: "customers",
    title: "주요 고객",
    prompt: "주요 고객 의존도와 그 리스크를 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 10,
  },
  {
    category: "valuation",
    title: "밸류에이션",
    prompt:
      "현재 밸류에이션이 비싼지 싼지, 어떤 가정을 반영하는지 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 11,
  },
  {
    category: "catalyst",
    title: "성장 Catalyst",
    prompt: "앞으로 주가/기업가치를 움직일 촉매를 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 12,
  },
  {
    category: "risk",
    title: "리스크",
    prompt:
      "이 회사 투자의 핵심 리스크와 논리가 깨지는 조건을 설명해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 13,
  },
  {
    category: "thesis",
    title: "투자 Thesis",
    prompt:
      "이 회사 투자 논리를 어떻게 세워야 하는지 프레임을 제시해 주세요. 마지막에 확인 질문을 하나 주세요.",
    orderNo: 14,
  },
] as const;

/**
 * Path to a company research workspace.
 * Dots are encoded as `~` so Next.js does not treat `.KS` as a file extension.
 * @param symbol - Universe ticker such as 005930.KS
 */
export function researchPath(symbol: string): string {
  return `/research/${encodeURIComponent(symbol.replace(/\./g, "~"))}`;
}

/**
 * Decode a workspace path segment back to a ticker.
 * @param raw - Path segment
 */
export function symbolFromResearchPath(raw: string): string {
  return decodeURIComponent(raw).replace(/~/g, ".");
}
