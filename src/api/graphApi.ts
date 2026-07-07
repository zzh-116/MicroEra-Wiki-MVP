import { KnowledgeGraphNode, KnowledgeGraphEdge } from '../types/wiki';
import { mockGraphNodes, mockGraphEdges, mockEntries } from '../mock/mockData';

export const graphApi = {
  async getGlobalGraph(): Promise<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          nodes: mockGraphNodes,
          edges: mockGraphEdges
        });
      }, 300);
    });
  },

  async getFocusedGraph(entryId: string): Promise<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Find the node corresponding to this entry
        const centralNode = mockGraphNodes.find(n => n.entryId === entryId);
        if (!centralNode) {
          // Fallback to returning all or empty
          resolve({ nodes: mockGraphNodes, edges: mockGraphEdges });
          return;
        }

        // Get direct edges connecting to or from the central node
        const connectedEdges = mockGraphEdges.filter(
          e => e.source === centralNode.id || e.target === centralNode.id
        );

        // Collect all node IDs involved in those edges
        const nodeIds = new Set<string>();
        nodeIds.add(centralNode.id);
        connectedEdges.forEach(e => {
          nodeIds.add(e.source);
          nodeIds.add(e.target);
        });

        // Filter nodes to only those that are connected
        const connectedNodes = mockGraphNodes.filter(n => nodeIds.has(n.id));

        resolve({
          nodes: connectedNodes,
          edges: connectedEdges
        });
      }, 250);
    });
  }
};
