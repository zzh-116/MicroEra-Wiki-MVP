#!/usr/bin/env node
/**
 * Tour Builder — Phase 1: Graph Topology Analysis
 *
 * Computes structural properties from the assembled knowledge graph:
 * fan-in/out rankings, entry points, BFS traversal, non-code files, clusters.
 */

const fs = require('fs');
const path = require('path');

// ── Parse args ──────────────────────────────────────────────
const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node ua-tour-analyze.js <input.json> <output.json>');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (err) {
  console.error('Failed to read input file:', err.message);
  process.exit(1);
}

const { nodes, edges, layers } = data;

// Build quick lookup maps
const nodeMap = {};
nodes.forEach(n => { nodeMap[n.id] = n; });

// Build adjacency: fan-in (who points TO me), fan-out (who I point TO)
const fanIn = {};   // nodeId -> Set of source node IDs
const fanOut = {};  // nodeId -> Set of target node IDs

nodes.forEach(n => {
  fanIn[n.id] = new Set();
  fanOut[n.id] = new Set();
});

edges.forEach(e => {
  if (nodeMap[e.source] && nodeMap[e.target]) {
    fanOut[e.source].add(e.target);
    fanIn[e.target].add(e.source);
  }
});

// ── A. Fan-In Ranking ──────────────────────────────────────
const fanInRanking = nodes
  .map(n => ({ id: n.id, fanIn: fanIn[n.id].size, name: n.name || n.id }))
  .sort((a, b) => b.fanIn - a.fanIn)
  .slice(0, 20);

// ── B. Fan-Out Ranking ─────────────────────────────────────
const fanOutRanking = nodes
  .map(n => ({ id: n.id, fanOut: fanOut[n.id].size, name: n.name || n.id }))
  .sort((a, b) => b.fanOut - a.fanOut)
  .slice(0, 20);

// ── C. Entry Point Candidates ──────────────────────────────
const entryPatterns = [
  'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
  'server.ts', 'server.js', 'mod.rs', 'main.go', 'main.py', 'main.rs',
  'manage.py', 'app.py', 'wsgi.py', 'asgi.py', 'run.py', '__main__.py',
  'Application.java', 'Main.java', 'Program.cs', 'config.ru', 'index.php',
  'App.swift', 'Application.kt', 'main.cpp', 'main.c'
];

// Determine fan-out threshold (top 10%) and fan-in threshold (bottom 25%)
const fOSorted = [...nodes].sort((a, b) => fanOut[b.id].size - fanOut[a.id].size);
const fISorted = [...nodes].sort((a, b) => fanIn[a.id].size - fanIn[b.id].size);
const foTop10Pct = fanOut[fOSorted[Math.max(0, Math.floor(fOSorted.length * 0.1))]?.id]?.size || 999;
const fiBot25Pct = fanIn[fISorted[Math.min(fISorted.length - 1, Math.floor(fISorted.length * 0.75))]?.id]?.size || 0;

function computeEntryScore(n) {
  let score = 0;
  const name = (n.name || '').toLowerCase();
  const fp = (n.filePath || '').replace(/\\/g, '/');

  // Documentation files
  if (n.type === 'document') {
    if (name === 'readme.md' && (fp === 'README.md' || fp === 'readme.md')) {
      score += 5;
    } else if (name.endsWith('.md') && !fp.includes('/')) {
      score += 2;
    }
    return score;
  }

  // Code files only
  if (n.type !== 'file') return 0;

  // Filename match
  for (const pat of entryPatterns) {
    if (name === pat.toLowerCase()) {
      score += 3;
      break;
    }
  }

  // At project root or one level deep
  const depth = fp.split('/').length;
  if (depth <= 2) {
    score += 1;
  }

  // High fan-out (top 10%)
  if (fanOut[n.id].size >= foTop10Pct && fanOut[n.id].size > 0) {
    score += 1;
  }

  // Low fan-in (bottom 25%)
  if (fanIn[n.id].size <= fiBot25Pct) {
    score += 1;
  }

  return score;
}

const entryCandidates = nodes
  .map(n => ({ id: n.id, score: computeEntryScore(n), name: n.name, summary: n.summary || '', type: n.type }))
  .filter(c => c.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

// ── D. BFS Traversal ───────────────────────────────────────
// Pick the top code entry point (skip documents)
const topCodeEntry = entryCandidates.find(c => c.type === 'file');
let bfsResult = { startNode: null, order: [], depthMap: {}, byDepth: {} };

if (topCodeEntry) {
  const startId = topCodeEntry.id;
  const visited = new Set();
  const depthMap = {};
  const queue = [{ id: startId, depth: 0 }];
  visited.add(startId);
  const order = [];

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    order.push(id);
    depthMap[id] = depth;

    for (const neighbor of fanOut[id]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }

  // Group by depth
  const byDepth = {};
  for (const [nid, d] of Object.entries(depthMap)) {
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(nid);
  }

  bfsResult = { startNode: startId, order, depthMap, byDepth };
}

// ── E. Non-Code File Inventory ─────────────────────────────
const nonCodeFiles = {
  documentation: [],
  infrastructure: [],
  data: [],
  config: []
};

nodes.forEach(n => {
  const entry = { id: n.id, name: n.name, type: n.type, summary: n.summary || '' };
  switch (n.type) {
    case 'document':
      nonCodeFiles.documentation.push(entry);
      break;
    case 'service':
    case 'pipeline':
    case 'resource':
      nonCodeFiles.infrastructure.push(entry);
      break;
    case 'table':
    case 'schema':
    case 'endpoint':
      nonCodeFiles.data.push(entry);
      break;
    case 'config':
      nonCodeFiles.config.push(entry);
      break;
  }
});

// ── F. Tightly Coupled Clusters ────────────────────────────
// Find bidirectional edge pairs, then expand
const bidirPairs = [];
const processedPairs = new Set();

edges.forEach(e => {
  if (!nodeMap[e.source] || !nodeMap[e.target]) return;
  const key = [e.source, e.target].sort().join('|||');
  if (processedPairs.has(key)) return;

  // Check if reverse edge exists
  const hasReverse = edges.some(re =>
    re.source === e.target && re.target === e.source
  );

  if (hasReverse) {
    processedPairs.add(key);
    bidirPairs.push([e.source, e.target]);
  }
});

// Build clusters from bidir pairs (merge overlapping)
function buildClusters(pairs) {
  const clusters = [];

  for (const [a, b] of pairs) {
    let found = false;
    for (const cluster of clusters) {
      if (cluster.has(a) || cluster.has(b)) {
        cluster.add(a);
        cluster.add(b);
        found = true;
        break;
      }
    }
    if (!found) {
      clusters.push(new Set([a, b]));
    }
  }

  // Merge overlapping clusters
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const overlap = [...clusters[i]].some(n => clusters[j].has(n));
        if (overlap) {
          for (const n of clusters[j]) clusters[i].add(n);
          clusters.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  return clusters.map(c => [...c]).filter(c => c.length >= 2 && c.length <= 5);
}

// Also expand by adding nodes that connect to 2+ cluster members
function expandClusters(clusters) {
  return clusters.map(cluster => {
    const expanded = new Set(cluster);
    for (const n of nodes) {
      if (expanded.has(n.id)) continue;
      let connections = 0;
      for (const member of cluster) {
        if (fanOut[n.id].has(member) || fanIn[n.id].has(member)) {
          connections++;
        }
      }
      if (connections >= 2) {
        expanded.add(n.id);
      }
    }
    // Cap at 5
    const result = [...expanded];
    if (result.length > 5) return result.slice(0, 5);
    return result;
  });
}

let clusters = buildClusters(bidirPairs);
clusters = expandClusters(clusters);
// Filter and limit
clusters = clusters.filter(c => c.length >= 2 && c.length <= 5).slice(0, 10);

// Count edges within each cluster
const clusterResults = clusters.map(cluster => {
  const clusterSet = new Set(cluster);
  let edgeCount = 0;
  edges.forEach(e => {
    if (clusterSet.has(e.source) && clusterSet.has(e.target)) edgeCount++;
  });
  return { nodes: cluster, edgeCount };
}).sort((a, b) => b.edgeCount - a.edgeCount);

// ── G. Layer List ──────────────────────────────────────────
const layersOutput = {
  count: (layers || []).length,
  list: (layers || []).map(l => ({ id: l.id, name: l.name, description: l.description || '' }))
};

// ── H. Node Summary Index ──────────────────────────────────
const nodeSummaryIndex = {};
nodes.forEach(n => {
  nodeSummaryIndex[n.id] = {
    name: n.name || '',
    type: n.type || '',
    summary: n.summary || '',
    filePath: n.filePath || ''
  };
});

// ── Output ─────────────────────────────────────────────────
const result = {
  scriptCompleted: true,
  entryPointCandidates: entryCandidates,
  fanInRanking,
  fanOutRanking,
  bfsTraversal: bfsResult,
  nonCodeFiles,
  clusters: clusterResults,
  layers: layersOutput,
  nodeSummaryIndex,
  totalNodes: nodes.length,
  totalEdges: edges.length
};

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log(`Analysis complete. Results written to ${outputPath}`);
console.log(`  Nodes: ${nodes.length}, Edges: ${edges.length}`);
console.log(`  Entry points: ${entryCandidates.length}`);
console.log(`  BFS nodes visited: ${bfsResult.order.length}`);
console.log(`  Clusters found: ${clusterResults.length}`);
console.log(`  Non-code files: docs=${nonCodeFiles.documentation.length} infra=${nonCodeFiles.infrastructure.length} data=${nonCodeFiles.data.length} config=${nonCodeFiles.config.length}`);
process.exit(0);
