import { Reference } from '../types/wiki';
import { post } from './client';

export interface AIResponse {
  answer: string;
  references: Reference[];
  relatedEntryIds: string[];
}

export const queryApi = {
  async askAI(question: string): Promise<AIResponse> {
    try {
      const data = await post<{
        answer: string;
        sources: Array<{ id: number; title: string }>;
      }>('/ai/chat', { question });

      // Convert MVP sources to v0.1.1 Reference format
      const references: Reference[] = (data.sources || []).map((s) => ({
        id: `ref-ai-${s.id}`,
        fromEntryId: String(s.id),
        locator: '',
        quote: '',
        referenceType: 'document' as const,
        title: s.title,
        updatedAt: new Date().toISOString(),
      }));

      return {
        answer: data.answer || '（未收到回复）',
        references,
        relatedEntryIds: references.map((r) => r.fromEntryId),
      };
    } catch (err: any) {
      return {
        answer: `[AI 服务暂时不可用] ${err.message || '未知错误'}`,
        references: [],
        relatedEntryIds: [],
      };
    }
  },
};
