export type ThesisStatus = "ACTIVE" | "WATCH" | "WEAKENING" | "BROKEN";
export type ThesisSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
export type ChangeStatus = "PENDING" | "APPLIED" | "DISMISSED";
export type DataConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export type RelatedThesisImpact = {
  thesisId: number;
  impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  impactScore: number;
  proposedStatus?: ThesisStatus | null;
  proposedSentiment?: ThesisSentiment | null;
  proposedConfidence?: number | null;
  reason: string;
};

export type NoteDraft = {
  title: string;
  newLearnings: string[];
  investmentIdea: string;
  thingsToCheck: string[];
  tags: string[];
};

export type ResearchAnswer = {
  answer: string;
  summary: string;
  fact: string;
  analysis: string;
  userThesis: string;
  bullFactors: string[];
  bearFactors: string[];
  thingsToCheck: string[];
  relatedThesis: RelatedThesisImpact[];
  suggestResearchNote: boolean;
  noteDraft: NoteDraft | null;
  dataConfidence: DataConfidence;
};

export type CompanyQuote = {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
  currency: string;
  asOf: string | null;
};

export type NewsHeadline = {
  title: string;
  link: string;
  published: string;
};

export type PredictionSlice = {
  action: string;
  confidence: number;
  rationale: string;
  scannedAt: string | null;
};

export type CompanyPrediction = {
  short: PredictionSlice | null;
  long: PredictionSlice | null;
  divergenceNote: string;
};

export type UserCompanyResearch = {
  id: number;
  symbol: string;
  market: string;
  name: string;
  watching: boolean;
  studyProgress: number;
  overallSentiment: ThesisSentiment;
  confidence: number;
  lastStudiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InvestmentThesis = {
  id: number;
  symbol: string;
  title: string;
  description: string;
  status: ThesisStatus;
  sentiment: ThesisSentiment;
  confidence: number;
  evidence: string;
  counterEvidence: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastReviewedAt: string | null;
};

export type ResearchNote = {
  id: number;
  symbol: string;
  title: string;
  summary: string;
  newLearnings: string[];
  investmentIdea: string;
  thingsToCheck: string[];
  tags: string[];
  relatedThesisId: number | null;
  sourceConversationId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ResearchMessage = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  structured: ResearchAnswer | null;
  createdAt: string | null;
};

export type TimelineEvent = {
  id: number;
  symbol: string;
  eventType: string;
  title: string;
  summary: string;
  eventDate: string;
  aiOpinion: string;
  userOpinion: string;
  relatedThesisId: number | null;
  createdAt: string | null;
};

export type ResearchChange = {
  id: number;
  symbol: string;
  title: string;
  summary: string;
  relatedThesisId: number | null;
  impact: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  impactScore: number;
  proposedStatus: ThesisStatus | null;
  proposedSentiment: ThesisSentiment | null;
  proposedConfidence: number | null;
  status: ChangeStatus;
  sourceType: string;
  createdAt: string | null;
};

export type StudyTopic = {
  id: number;
  category: string;
  title: string;
  prompt: string;
  orderNo: number;
  completed: boolean;
};

export type ResearchJudgment = {
  id: number;
  symbol: string;
  statement: string;
  rationale: string;
  priceAtTime: number | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  versions: Array<{
    id: number;
    statement: string;
    rationale: string;
    priceAtTime: number | null;
    createdAt: string | null;
  }>;
};

export type ResearchNotification = {
  id: number;
  symbol: string;
  type: string;
  title: string;
  message: string;
  readYn: boolean;
  createdAt: string | null;
};

export type WatchlistCard = {
  research: UserCompanyResearch;
  quote: CompanyQuote;
  longSentiment: ThesisSentiment;
  thesisChangedToday: boolean;
  newEventCount: number;
};

export type ResearchWorkspace = {
  company: { symbol: string; name: string; market: string };
  research: UserCompanyResearch;
  quote: CompanyQuote;
  fundamentals: Record<string, unknown>;
  news: NewsHeadline[];
  prediction: CompanyPrediction;
  theses: InvestmentThesis[];
  notes: ResearchNote[];
  conversationId: number;
  messages: ResearchMessage[];
  timeline: TimelineEvent[];
  todayChanges: ResearchChange[];
  curriculum: StudyTopic[];
  judgments: ResearchJudgment[];
  notifications: ResearchNotification[];
  loadError?: string;
};
