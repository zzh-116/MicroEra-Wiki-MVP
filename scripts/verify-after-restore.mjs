import { chromium } from 'playwright';

const LABELS = ['知识条目', '学术论文', 'Sandbox 项目', '数据标准'];
const TYPE_COLORS = [
  'Sandbox项目',
  '学术论文',
  '专利成果',
  '技术文档',
  '数据标准',
  '模板规范',
  '商业资料',
  '手写笔记',
];

function statValuesFromLines(lines) {
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i];
    if (LABELS.includes(label)) {
      const valueLine = lines[i - 1];
      if (/^\d+$/.test(valueLine || '')) out[label] = Number(valueLine);
    }
  }
  return out;
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.fill('#login-username-input', 'admin');
await page.fill('#login-password-input', 'admin123');
await page.click('#login-submit-btn');
await page.waitForTimeout(3000);

const storageSnapshot = await page.evaluate(() => {
  const keys = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    keys[k] = localStorage.getItem(k);
  }
  return keys;
});
console.log('LOGIN_URL', page.url());
console.log('LOCAL_STORAGE_KEYS', Object.keys(storageSnapshot).sort());
console.log('HAS_TOKEN', Boolean(storageSnapshot.miqro_wiki_token));

await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

const homeInfo = await page.evaluate(() => ({
  url: location.pathname,
  hasPublic: !!document.querySelector('#public-home-panel'),
  hasInternal: !!document.querySelector('#internal-home-panel'),
  body: document.body.innerText,
}));

const lines = homeInfo.body.split('\n').map((s) => s.trim()).filter(Boolean);
console.log('HOME_PANEL', homeInfo.hasPublic ? 'public' : homeInfo.hasInternal ? 'internal' : 'none');
console.log('HOME_STATS', JSON.stringify(statValuesFromLines(lines)));

await page.screenshot({ path: 'C:/Users/CAIHUI/AppData/Local/Temp/home-stats.png', fullPage: true });

const apiCheck = await page.evaluate(async () => {
  const token = localStorage.getItem('miqro_wiki_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const entriesRes = await fetch('/api/entries', { headers });
  const entries = await entriesRes.json();
  const graphRes = await fetch('/api/graph/global', { headers });
  const graph = await graphRes.json();
  return {
    entriesStatus: entriesRes.status,
    entryCount: Array.isArray(entries) ? entries.length : null,
    entries: Array.isArray(entries) ? entries : [],
    graphStatus: graphRes.status,
    nodes: graph.nodes || [],
    edges: graph.edges || [],
  };
});

const entryCounts = {
  total: apiCheck.entryCount,
  academic_paper: apiCheck.entries.filter((e) => e.entry_type === 'academic_paper').length,
  sandbox_project: apiCheck.entries.filter((e) => e.entry_type === 'sandbox_project').length,
  data_standard: apiCheck.entries.filter((e) => e.entry_type === 'data_standard').length,
};
console.log('ENTRIES_STATUS', apiCheck.entriesStatus);
console.log('ENTRY_COUNTS', JSON.stringify(entryCounts));

const nodes = apiCheck.nodes;
const labels = nodes.map((n) => n.label);
const types = {};
for (const n of nodes) types[n.type] = (types[n.type] || 0) + 1;
const unknownTypes = [...new Set(nodes.map((n) => n.type))].filter((t) => !TYPE_COLORS.includes(t));
const bad = labels.filter((l) => !l || l === 'Review' || l.includes('?') || l.includes('\uFFFD'));
const duplicateLabels = labels.filter((l, i) => labels.indexOf(l) !== i);
const filenameLike = labels.filter((l) => /\.(pdf|docx|pptx|xlsx|txt|md)$/i.test(l) || /^(1-s2\.0-|savedrecs|CN\d|US\d|EP\d|PCT|wos_|main\d?$|f212|paper_retrieval$)/i.test(l)).slice(0, 20);

console.log('GRAPH_STATUS', apiCheck.graphStatus);
console.log('GRAPH nodes', nodes.length, 'edges', apiCheck.edges.length, 'distinctLabels', new Set(labels).size);
console.log('GRAPH types', JSON.stringify(types));
console.log('GRAPH unknownTypes', JSON.stringify(unknownTypes));
console.log('GRAPH duplicateLabels', JSON.stringify(duplicateLabels.slice(0, 10)));
console.log('GRAPH bad', JSON.stringify(bad.slice(0, 10)));
console.log('GRAPH filenameLike sample', JSON.stringify(filenameLike));
console.log('GRAPH label sample', JSON.stringify(labels.slice(0, 8)));

const graphErrors = [];
page.on('pageerror', (e) => graphErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') graphErrors.push(m.text()); });
await page.goto('http://localhost:3000/graph', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);
await page.screenshot({ path: 'C:/Users/CAIHUI/AppData/Local/Temp/graph-after-restore.png', fullPage: true });
const canvasInfo = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { hasCanvas: false };
  const ctx = canvas.getContext('2d');
  let nonBlank = 0;
  if (ctx) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) nonBlank++;
      if (nonBlank > 2000) break;
    }
  }
  return { hasCanvas: true, width: canvas.width, height: canvas.height, nonBlankPixels: nonBlank };
});
console.log('GRAPH_CANVAS', JSON.stringify(canvasInfo));
console.log('GRAPH_ERRORS', JSON.stringify(graphErrors));

await page.goto('http://localhost:3000/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
const searchText = await page.evaluate(() => document.body.innerText);
const typeLabels = ['全部类型', 'Sandbox 项目', '学术论文', '数据标准', '模板规范', '商业资料', '专利成果', '技术文档', '手写笔记'];
const searchCounts = await page.evaluate((labels) => {
  const out = {};
  const buttonTexts = new Set();
  document.querySelectorAll('#search-page-panel button').forEach((btn) => {
    buttonTexts.add((btn.textContent || '').trim());
  });
  for (const text of buttonTexts) {
    for (const label of labels) {
      const match = text.match(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\d+)$`));
      if (match) out[label] = Number(match[1]);
    }
  }
  return out;
}, typeLabels);
console.log('SEARCH_TYPE_COUNTS', JSON.stringify(searchCounts));

const anonContext = await browser.newContext();
const anonPage = await anonContext.newPage();
await anonPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await anonPage.waitForTimeout(4000);
const anonInfo = await anonPage.evaluate(() => ({
  url: location.pathname,
  hasPublic: !!document.querySelector('#public-home-panel'),
  body: document.body.innerText,
}));
const anonLines = anonInfo.body.split('\n').map((s) => s.trim()).filter(Boolean);
console.log('ANON_HOME_PANEL', anonInfo.hasPublic ? 'public' : 'none');
console.log('ANON_HOME_STATS', JSON.stringify(statValuesFromLines(anonLines)));
const statsEndpoint = await anonPage.evaluate(async () => {
  const res = await fetch('/api/entries/stats');
  return { status: res.status, body: await res.json() };
});
console.log('STATS_ENDPOINT', statsEndpoint.status, JSON.stringify(statsEndpoint.body));
await anonContext.close();

console.log('ERRORS', JSON.stringify(errors));
await browser.close();
