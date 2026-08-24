import { createClient } from "@/lib/supabase/server";
import { RESEARCH_NOTE_SEARCH_LIMIT } from "@/lib/research/constants";
import type { InvestmentThesis, NoteDraft, ResearchNote } from "@/lib/research/types";

type JsonMap = Record<string, unknown>;

function asIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "")).filter(Boolean);
}

function toNote(row: JsonMap): ResearchNote {
  return {
    id: Number(row.id),
    symbol: String(row.symbol || ""),
    title: String(row.title || ""),
    summary: String(row.summary || ""),
    newLearnings: asStringList(row.new_learnings),
    investmentIdea: String(row.investment_idea || ""),
    thingsToCheck: asStringList(row.things_to_check),
    tags: asStringList(row.tags),
    relatedThesisId: row.related_thesis_id == null ? null : Number(row.related_thesis_id),
    sourceConversationId:
      row.source_conversation_id == null ? null : Number(row.source_conversation_id),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

/**
 * Research memory layer. Keyword search now; swap `searchRelevantNotes` for embeddings later.
 */
export const ResearchMemoryService = {
  /**
   * Persist a structured research note.
   */
  async saveResearchNote(input: {
    userId: string;
    symbol: string;
    draft: NoteDraft;
    summary?: string;
    relatedThesisId?: number | null;
    sourceConversationId?: number | null;
  }): Promise<ResearchNote> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("research_notes")
      .insert({
        user_id: input.userId,
        symbol: input.symbol,
        title: input.draft.title.slice(0, 256),
        summary: (input.summary || input.draft.investmentIdea || "").slice(0, 4000),
        new_learnings: input.draft.newLearnings,
        investment_idea: input.draft.investmentIdea,
        things_to_check: input.draft.thingsToCheck,
        tags: input.draft.tags,
        related_thesis_id: input.relatedThesisId || null,
        source_conversation_id: input.sourceConversationId || null,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error || !data) {
      throw error || new Error("노트를 저장하지 못했습니다.");
    }
    return toNote(data as JsonMap);
  },

  /**
   * Keyword search over notes for this user (optionally one company).
   * Replace this implementation with vector retrieval without changing callers.
   */
  async searchRelevantNotes(input: {
    userId: string;
    query: string;
    symbol?: string;
    limit?: number;
  }): Promise<ResearchNote[]> {
    const supabase = await createClient();
    const limit = input.limit || RESEARCH_NOTE_SEARCH_LIMIT;
    const query = input.query.trim();
    let request = supabase
      .from("research_notes")
      .select("*")
      .eq("user_id", input.userId)
      .order("id", { ascending: false })
      .limit(40);
    if (input.symbol) {
      request = request.eq("symbol", input.symbol);
    }
    const { data, error } = await request;
    if (error || !data) {
      return [];
    }
    const notes = data.map((row) => toNote(row as JsonMap));
    if (!query) {
      return notes.slice(0, limit);
    }
    const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
    const ranked = notes
      .map((note) => {
        const blob = `${note.title} ${note.summary} ${note.investmentIdea} ${note.tags.join(" ")} ${note.newLearnings.join(" ")}`.toLowerCase();
        const score = tokens.reduce((sum, token) => sum + (blob.includes(token) ? 1 : 0), 0);
        return { note, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    return (ranked.length > 0 ? ranked.map((item) => item.note) : notes).slice(0, limit);
  },

  /**
   * Build a compact conversation summary used when auto-creating a note.
   */
  summarizeConversation(messages: Array<{ role: string; content: string }>): string {
    return messages
      .slice(-8)
      .map((item) => `${item.role === "user" ? "사용자" : "AI"}: ${item.content}`)
      .join("\n")
      .slice(0, 4000);
  },

  /**
   * Find theses whose title/description overlap the question.
   */
  findRelatedThesis(theses: InvestmentThesis[], query: string): InvestmentThesis[] {
    const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
    if (tokens.length === 0) {
      return theses.slice(0, 4);
    }
    return theses
      .map((thesis) => {
        const blob = `${thesis.title} ${thesis.description}`.toLowerCase();
        const score = tokens.reduce((sum, token) => sum + (blob.includes(token) ? 1 : 0), 0);
        return { thesis, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((item) => item.thesis);
  },
};
