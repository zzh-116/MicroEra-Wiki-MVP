import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '../types/wiki';

export const graphApi = {
  async getGlobalGraph(): Promise<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }> {
    try {
      const res = await fetch('/api/graph/global');
      if (!res.ok) return { nodes: [], edges: [] };
      return res.json();
    } catch {
      return { nodes: [], edges: [] };
    }
  },

  async getFocusedGraph(entryId: string): Promise<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }> {
    try {
      const res = await fetch(`/api/graph/focused?entryId=${encodeURIComponent(entryId)}`);
      if (!res.ok) return { nodes: [], edges: [] };
      return res.json();
    } catch {
      return { nodes: [], edges: [] };
    }
  },
};
