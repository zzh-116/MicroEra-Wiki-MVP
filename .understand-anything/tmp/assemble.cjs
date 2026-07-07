const fs = require('fs');
const path = require('path');

const PROJECT = 'C:/Users/Intership004/zzh/company-wiki-mvp_v0.0.2';
const base = PROJECT + '/.understand-anything/intermediate';

// Read all files
const layersRaw = JSON.parse(fs.readFileSync(path.join(base, 'layers.json'), 'utf8'));
const tourRaw = JSON.parse(fs.readFileSync(path.join(base, 'tour.json'), 'utf8'));
const assembled = JSON.parse(fs.readFileSync(path.join(base, 'assembled-graph.json'), 'utf8'));

// Normalize layers
const layers = layersRaw.layers.map(l => ({
  id: 'layer:' + l.id,
  name: l.name,
  description: l.description || l.responsibility || '',
  nodeIds: (l.files || l.nodeIds || []).map(f =>
    typeof f === 'string'
      ? (f.match(/^(file|config|document|service|pipeline|table|schema|resource|endpoint):/) ? f : 'file:' + f)
      : f.id
  )
}));

// Normalize tour
let tourSteps = Array.isArray(tourRaw) ? tourRaw : (tourRaw.steps || tourRaw.tour || []);
tourSteps = tourSteps.map((s, i) => ({
  order: s.order || i + 1,
  title: s.title || s.name || '',
  description: s.description || s.detail || '',
  nodeIds: (s.nodeIds || s.nodes || s.files || []).map(f =>
    typeof f === 'string'
      ? (f.match(/^(file|config|document|service|pipeline|table|schema|resource|endpoint):/) ? f : 'file:' + f)
      : f.id
  )
}));
tourSteps.sort((a, b) => a.order - b.order);

// Build final graph
const finalGraph = {
  version: '1.0.0',
  project: {
    name: 'company-wiki-mvp',
    languages: ['TypeScript', 'JSON', 'Markdown', 'HTML', 'CSS'],
    frameworks: ['React 19', 'Vite 6', 'Express 4', 'TailwindCSS v4'],
    description: 'MicroEra Wiki MVP — 企业知识库与信息资产管理平台',
    analyzedAt: new Date().toISOString(),
    gitCommitHash: '0000000000000000000000000000000000000000'
  },
  nodes: assembled.nodes,
  edges: assembled.edges,
  layers: layers,
  tour: tourSteps
};

// Save assembled graph
fs.writeFileSync(path.join(base, 'assembled-graph.json'), JSON.stringify(finalGraph, null, 2), 'utf8');

// Print stats
const nodeTypes = {};
finalGraph.nodes.forEach(n => { nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1; });
const edgeTypes = {};
finalGraph.edges.forEach(e => { edgeTypes[e.type] = (edgeTypes[e.type] || 0) + 1; });

console.log('Final graph: ' + finalGraph.nodes.length + ' nodes, ' + finalGraph.edges.length + ' edges');
console.log('Node types:', JSON.stringify(nodeTypes));
console.log('Layers:', finalGraph.layers.length);
console.log('Tour steps:', finalGraph.tour.length);
