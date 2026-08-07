import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '../types/wiki';
import { getAuthHeaders } from './client';

export const graphApi = {
  async getGlobalGraph(): Promise<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }> {
    try {
      const res = await fetch('/api/graph/global', { headers: getAuthHeaders() });
      if (!res.ok) return { nodes: [], edges: [] };
      return res.json();
    } catch {
      return { nodes: [], edges: [] };
    }
  },

  async getFocusedGraph(entryId: string): Promise<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }> {
    try {
      const res = await fetch(`/api/graph/focused?entryId=${encodeURIComponent(entryId)}`, { headers: getAuthHeaders() });
      if (!res.ok) return { nodes: [], edges: [] };
      return res.json();
    } catch {
      return { nodes: [], edges: [] };
    }
  },
};
