import { readFileSync } from 'node:fs';
import { db, closePool } from '../backend/db/connection.js';
import { entries } from '../backend/db/schema.js';
import { eq } from 'drizzle-orm';

const DRY_RUN = process.env.DRY_RUN === '1';

const exportData = JSON.parse(
  readFileSync(new URL('../backend/data/metadata/entries_export.json', import.meta.url), 'utf8'),
);

const exportTitleById = new Map<number, string>();
for (const e of exportData.entries) exportTitleById.set(e.id, e.title);

const generatedPdfTitles = JSON.parse(
  readFileSync(new URL('./pdf_titles.json', import.meta.url), 'utf8'),
) as Record<string, string | null>;

const pdfTitleOverrides: Record<string, string> = {
  '1-s2.0-S2351978919303488-main':
    'Costing models for capacity optimization in Industry 4.0: Trade-off between used capacity and operational efficiency',
  '2025-lignin2': 'Recent advances in generation of bioproducts from lignin: a comprehensive review',
  '2025_waste': 'Use of industrial pulp and paper waste as agricultural inputs: A systematic literature review',
  '2025.07.21.665674v1.full':
    'AlphaGEM Enables Precise Genome-Scale Metabolic Modelling by Integrating Protein Structure Alignment with deep-learning-based Dark Metabolism Mining',
  '2025_ Orange peel composition-mono': '橙皮成分、生物聚合物提取及其在造纸与包装领域的应用：综述',
  '2025_ Orange peel composition': '橙皮成分、生物聚合物提取及其在造纸与包装领域的应用：综述',
  BC: '高效低能耗发酵生产细菌纤维素技术',
  'Engineering Ligninolytic Consortium for Bioconversion of Lignocelluloses to Ethanol and Chemicals(科研通-ablesci.com)':
    'Engineering Ligninolytic Consortium for Bioconversion of Lignocelluloses to Ethanol and Chemicals',
  'Green synthesis of ZnO-NPs using sugarcane bagasse waste_ Phytochemical assessment of extract and biological study of nanopartic(科研通-ablesci.com)':
    'Green synthesis of ZnO-NPs using sugarcane bagasse waste: phytochemical assessment of extract and biological study of nanoparticles',
  'Noor_2020_IOP_Conf._Ser.__Earth_Environ._Sci._599_012051':
    'Bio-packaging based on a composite of paper waste and coconut fiber',
  f2121195da604aab89e06cbdd8b6cc43: '非粮生物基材料产业创新发展典型案例入围名单（公示稿）',
  'fenrg-4-1549247':
    'Optimizing COD removal, lignin degradation and electricity generation from pulp and paper industry wastewater by CW-MFC using box-behnken design',
  paper_retrieval: '论文摘要检索合集（paper_retrieval）',
  's10668-024-05154-8': 'Coconut husk: A sustainable solution for eco-friendly packaging applications',
  's12649-025-03057-x': 'Nonsterile Lactic Acid Production from Pulse Husks',
  's40643-025-00905-5':
    'Blasting extrusion pretreatment of sweet sorghum bagasse for enhanced enzymatic saccharification and ethanol production using Pichia kudriavzevii ATCC 20,381',
  's41598-025-00610-5':
    'Transforming waste into value: Single-step in situ synthesis of magnetic porous carbon composite adsorbents from sugarcane bagasse and iron scrap',
  's42452-025-07560-7':
    'Advancements in sustainable lactic acid production: revolutionizing biorefineries by harnessing genetically engineered LAB and lignocellulosic biomass',
};

const pdfTitleByExportTitle: Record<string, string> = {};
for (const [key, value] of Object.entries(generatedPdfTitles)) {
  if (value) pdfTitleByExportTitle[key] = value;
}
Object.assign(pdfTitleByExportTitle, pdfTitleOverrides);

const manualTitles: Record<number, string> = {
  48: '可吸附乙炔的MOF文献清单',
  80: 'MOF传感器文献清单',
  96: '测试模板',
  285: 'SAGE: A Self-Evolving Agentic Graph-Memory Engine for Structure-Aware Associative Memory',
  286: 'MOF-303小试放大预算和风险评估报告',
  287: 'SAGE: A Self-Evolving Agentic Graph-Memory Engine for Structure-Aware Associative Memory',
  288: 'MOF-303小试放大预算和风险评估报告',
  289: '测试条目（已删除）',
  290: '测试条目（已删除）',
  291: '测试条目（已删除）',
  292: '测试条目（已删除）',
  293: '测试条目（已删除）',
  294: '关于造纸酶的产业化导向',
  295: '关于造纸酶的产业化导向',
  296: 'vscode wiki 开发记录',
  297: 'wiki 数据需求',
  298: '关于造纸酶的产业化导向',
  299: '关于造纸酶的产业化导向',
  300: '关于造纸酶的产业化导向',
  301: '关于造纸酶的产业化导向',
  302: 'OpenViking 对 MicroEra-Wiki 的可参考设计',
  303: 'MOF-303小试放大预算和风险评估报告',
  304: 'MOF-303小试放大预算和风险评估报告',
  305: 'OpenViking 对 MicroEra-Wiki 的可参考设计',
  306: 'OpenViking 对 MicroEra-Wiki 的可参考设计',
  307: '大宗购买-泰坦报价',
  308: 'MOF水热合成-成本核算（2）',
  309: 'MOFs产品开发方案',
  310: 'Web of Science 造纸文献清单',
  311: '造纸流程',
  312: '王熠赟（化学材料研究员）',
  313: '王梦瑶（化学材料研究员）',
  314: '毛思慧（化学材料研究员）',
  315: '早会-周会',
  316: '郑州环合生物医药有限公司销售合同',
  317: 'Valorisation of Industrial Waste for Second-Generation Ethanol Production: Towards the Scale-Up of High-Solids Paper Sludge Fermentation',
  318: '新建 Microsoft Word 文档',
  319: 'Advances in Nanocellulose-Based Composites for Sustainable Food Packaging',
  320: 'Impact of Nano-Silica, Cationic Polyacrylamide, and Cationic Starch on Long Fiber Utilization in Recycled Paper Production',
  321: 'Green Synthesis of Zinc Oxide Nanoparticles using Brown Algae on Oil Palm Empty Fruit Bunch Pulp and Paper Substrates: Effect of pH 6 to 8',
  322: 'savedrecs 文献检索记录',
  323: 'METHOD FOR PREPARING 5-HYDROXYMETHYLFURFURAL',
  324: '论文标题清单（Year，Article Title）',
  325: 'From black to green - A critical review of thermochemical valorization of black liquor',
  326: 'A mini-review on lignin isolation and modification based on sorbent materials with porous nature as demulsifier for oil/water separations',
  327: 'Recent advances in generation of bioproducts from lignin: a comprehensive review',
  328: 'Transparent Wood Fabrication and Applications: A Review',
  329: 'Advances in Nanocellulose-Based Composites for Sustainable Food Packaging',
  330: 'Impact of Nano-Silica, Cationic Polyacrylamide, and Cationic Starch on Long Fiber Utilization in Recycled Paper Production',
  331: 'Green Synthesis of Zinc Oxide Nanoparticles using Brown Algae on Oil Palm Empty Fruit Bunch Pulp and Paper Substrates: Effect of pH 6 to 8',
  332: '橙皮成分、生物聚合物提取及其在造纸与包装领域的应用：综述',
  333: 'Chimeric enzymes in the pulp and paper making industry: Current developments',
  351: 'CN201610046821.8_一种选择性制备1-羟基-2,5-己二酮及2,5-呋喃二甲醇的方法',
  352: '材料组-实验采购记录与账本',
  353: 'CN201710768995.X_一种1,10-癸二酸的制备方法',
  354: 'CN201810321005.2_一种正辛醇酯及其正辛醇的制备方法',
  355: 'PCTCN2025079285_一种呋喃二甲酸的制备方法及装置',
  356: 'savedrecs 文献检索记录',
  367: 'CN201710451177.7_一种间羟基苯乙酮的制备方法',
  368: 'Enzyme Technology in the Food Industry: Molecular Mechanisms, Applications, and Sustainable Innovations',
  369: 'Decarbonization pathways for the pulp and paper industry: A comprehensive review',
  370: 'Advances in Nanocellulose-Based Composites for Sustainable Food Packaging',
  371: 'Impact of Nano-Silica, Cationic Polyacrylamide, and Cationic Starch on Long Fiber Utilization in Recycled Paper Production',
  372: 'Preparation and applications of nanoparticles from lignocellulosic biomass: A review',
};

const pseudoHeadings = new Set([
  'review',
  'original paper',
  'open access',
  'abstract',
  'introduction',
  'materials and methods',
  'results and discussion',
  'references',
  'publication classification',
  'contents lists available at sciencedirect',
  'pages',
  'author information',
  'discussion',
  'conclusion',
  'conclusions',
  'article info',
  'keywords',
  'experimental',
  'methods',
  'results',
  'research paper',
  'full length article',
  'article',
  'short communication',
  'case report',
  '基本信息',
  '教育背景',
  '实验_生活用品（志特纪元）',
]);

function looksLikePlaceholderOrFilename(title: string | undefined): boolean {
  if (!title) return true;
  const t = title.trim();
  if (!t || t === '????' || t.includes('\uFFFD') || /^Review$/i.test(t)) return true;
  if (/\.(pdf|docx|pptx|xlsx|txt|md|png|jpe?g)$/i.test(t)) return true;
  return /^(1-s2\.0-|CN\d|US\d|EP\d|PCT|savedrecs|Year，|wos_|_?Image|img_|MOF-303小试|新建 Microsoft|大宗购买|MOF水热|MOFs产品|造纸流程|早会-周会|郑州环合|材料组-|vscode|wiki 数据|关于造纸酶|prompt)/.test(
    t,
  );
}

function firstMeaningfulHeading(content: string | undefined): string | undefined {
  if (!content) return undefined;
  const lines = content.replace(/\r/g, '').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    let heading: string | undefined;
    const md = line.match(/^#{1,4}\s+(.+)$/);
    const bold = line.match(/^\*\*(.+)\*\*$/);
    if (md) heading = md[1].trim();
    else if (bold) heading = bold[1].trim();
    if (!heading || heading.length < 4) continue;
    const lower = heading.toLowerCase();
    if (pseudoHeadings.has(lower)) continue;
    if (/^(review|original paper|open access)/i.test(lower)) continue;
    if (/^\[embedded image/i.test(heading)) continue;
    return heading;
  }
  return undefined;
}

function titleFromSummary(summary: string | undefined): string | undefined {
  if (!summary) return undefined;
  const m = summary.match(/Auto-imported:\s*(.+)$/);
  const m2 = summary.match(/Imported from (?:zaozhi|md|pdf):\s*(.+)$/);
  const raw = m?.[1] ?? m2?.[1];
  if (!raw) return undefined;
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? raw;
  return base.replace(/\.(pdf|docx|pptx|xlsx|txt|md)$/i, '');
}

const rows = await db
  .select({
    id: entries.id,
    title: entries.title,
    summary: entries.summary,
    content: entries.content,
    type: entries.entryType,
    deletedAt: entries.deletedAt,
  })
  .from(entries)
  .orderBy(entries.id);

const plans: Array<{ id: number; from: string; to: string }> = [];
for (const row of rows) {
  const manual = manualTitles[row.id];
  const exportTitle = exportTitleById.get(row.id);
  const heading = firstMeaningfulHeading(row.content);
  const summaryTitle = titleFromSummary(row.summary);

  let next: string | undefined;
  if (manual) {
    next = manual;
  } else if (exportTitle && pdfTitleByExportTitle[exportTitle]) {
    next = pdfTitleByExportTitle[exportTitle];
  } else if (exportTitle && !looksLikePlaceholderOrFilename(exportTitle)) {
    next = exportTitle;
  } else if (heading && !looksLikePlaceholderOrFilename(heading)) {
    next = heading;
  } else if (exportTitle) {
    next = exportTitle;
  } else if (summaryTitle) {
    next = summaryTitle;
  } else {
    next = '未命名文档';
  }

  next = next.trim();
  if (next !== row.title) plans.push({ id: row.id, from: row.title, to: next });
}

console.log(`plan rows=${rows.length} changes=${plans.length} dryRun=${DRY_RUN}`);
for (const p of plans) console.log(`${p.id}\t${p.from}\t=>\t${p.to}`);

if (!DRY_RUN) {
  for (const p of plans) {
    await db.update(entries).set({ title: p.to }).where(eq(entries.id, p.id));
  }
  console.log(`updated ${plans.length} rows`);
}

await closePool();
