import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';
export type Lang = 'zh' | 'en';

export const translations = {
  // Navigation & Brand
  brandName: {
    zh: '微观纪元 Wiki',
    en: 'MicroEra Wiki'
  },
  brandDesc: {
    zh: '企业信息资产目录平台',
    en: 'Corporate Info Asset Catalog'
  },
  navHome: {
    zh: '公开首页',
    en: 'Home'
  },
  navEntries: {
    zh: '资产目录',
    en: 'Asset Catalog'
  },
  navAssets: {
    zh: '宣发素材库',
    en: 'Asset Library'
  },
  navDataItems: {
    zh: '研发数据对准',
    en: 'R&D Data Spec'
  },
  navAdmin: {
    zh: '管理员专区',
    en: 'Admin Panel'
  },
  navLogin: {
    zh: '内部登录',
    en: 'Login'
  },
  navLogout: {
    zh: '安全退出',
    en: 'Logout'
  },

  // Home Page
  heroSubtitle: {
    zh: '公司 Wiki & 信息资产展示平台',
    en: 'Corporate Wiki & Information Asset Platform'
  },
  heroDesc: {
    zh: '本平台旨在通过轻量、便捷的技术对齐，向客户及访客展示公司的核心产品路线、技术路线、专利技术储备，并在内部向老板、市场及研发组提供高共享度的展示素材及数据定义目录。',
    en: 'This platform aims to demonstrate core product roadmaps, technical tracks, and patent reserves to clients/visitors, while serving as a high-fidelity collaboration and showcase hub for executives, sales, and engineering groups.'
  },
  btnExplore: {
    zh: '探索全部条目',
    en: 'Explore All Entries'
  },
  btnLogin: {
    zh: '内部人员登录',
    en: 'Internal Staff Login'
  },
  latestPublicEntries: {
    zh: '最新公开通报与文献条目',
    en: 'Latest Public Announcements & Wiki Papers'
  },
  noAuthNeeded: {
    zh: '对外部访客免授权',
    en: 'Auth Free for Visitors'
  },
  viewMorePublic: {
    zh: '查看更多公开条目',
    en: 'View More Public Entries'
  },
  coreBusinessHeader: {
    zh: '公司核心业务维度目录',
    en: 'Core Corporate Business Categories'
  },
  statProductTitle: {
    zh: '主营业务',
    en: 'Core Businesses'
  },
  statProductDesc: {
    zh: '掌握半导体与先进超分子结构设计平台的生态，探寻未来场景支持。',
    en: 'Harness the ecosystem of semiconductors and advanced supramolecular design platforms for future demands.'
  },
  statTechTitle: {
    zh: '技术优势',
    en: 'Technical Edge'
  },
  statTechDesc: {
    zh: '结合图神经网络（GNN）多层性质预测、DFT算力自动化，加速物理研发。',
    en: 'Accelerate materials engineering with GNN property predictions and automated DFT computations.'
  },
  statPatentTitle: {
    zh: '专利成果',
    en: 'Patents & IP'
  },
  statPatentDesc: {
    zh: '高通量带隙逆向搜索与空间群标定拥有多项发明专利，成果资质透明可查。',
    en: 'Transparent patent listings for high-throughput bandgap inverse searches and spacegroup labeling.'
  },
  statDataTitle: {
    zh: '研发协作数据',
    en: 'R&D Shared Data'
  },
  statDataDesc: {
    zh: '（内部可见）跨组对齐的材料晶胞、空间对称结构及实验室测试时序配置。',
    en: '(Internal Only) Coaligned crystal unit cells, space symmetry groups, and lab testing parameters.'
  },
  viewSection: {
    zh: '查看分区',
    en: 'View Section'
  },
  mvpGuideTitle: {
    zh: '知识目录 MVP 演示指南与场景对齐',
    en: 'Wiki Catalog MVP Demostration Guide & Alignment Scenarios'
  },
  mvpGuideDesc: {
    zh: '本 MVP 旨在配合老板、市场拓展和研发协作开展功能沙盒验证。您可以使用测试账号 admin / admin123 登录，解锁「内部展示素材下载」、「各研发组 CIF/表定义数据字典对齐」以及「新知识条目直接发布与关联下载附件」等场景功能。',
    en: 'This MVP enables sandboxed trials for executives, business developers, and engineers. Access with admin / admin123 to unlock internal media downloads, cross-group CIF data dictionaries, and active attachments.'
  },
  scenario1Title: {
    zh: '场景 1：老板 PPT 汇报素材',
    en: 'Scenario 1: Slide Decks for Executives'
  },
  scenario1Desc: {
    zh: '登录后可在「素材库」下载晶体渲染效果图等，未登录状态下不予显示。',
    en: 'Download stunning high-res crystal graphics in the Asset Library upon logging in.'
  },
  scenario2Title: {
    zh: '场景 2：市场营销宣发查找',
    en: 'Scenario 2: Strategic Media Retrieval'
  },
  scenario2Desc: {
    zh: '分类精准，拥有“宣发素材/厂房照片”等一键筛选并带推荐用途说明。',
    en: 'Fast multi-attribute filtering for strategic photos and presentation slides with recommendations.'
  },
  scenario3Title: {
    zh: '场景 3：研发跨组对齐架构',
    en: 'Scenario 3: Inter-team Tech Specs'
  },
  scenario3Desc: {
    zh: '支持CIF数据定义、PostgreSQL schema更新版本、负责人登记和快速过滤。',
    en: 'Full specs for CIF coordinates, DB structural models, and lead personnel registrations.'
  },

  // Directory / Catalog Page
  catalogTitle: {
    zh: '企业信息资产目录',
    en: 'Corporate Info Asset Directory'
  },
  catalogDesc: {
    zh: '查阅我司最新的公开及内部 Wiki 档案（当前包含主营业务、专利信息、科研算法、物料条目等）。',
    en: 'Search and read public and confidential team archives (contains core products, patents, algorithms, material properties).'
  },
  btnCreateEntry: {
    zh: '新建知识条目',
    en: 'Create Archive Entry'
  },
  loginToManage: {
    zh: '登入后可管理/新建条目',
    en: 'Log in to draft or modify archives'
  },
  searchKeywords: {
    zh: '输入关键字检索标题/正文',
    en: 'Search title or body text'
  },
  allTypesList: {
    zh: '全部条目类型',
    en: 'All Types'
  },
  allVisibility: {
    zh: '全部可见范围',
    en: 'All Visibility'
  },
  allCategories: {
    zh: '全部业务分类',
    en: 'All Categories'
  },
  activeFilters: {
    zh: '当前生效筛选：',
    en: 'Active criteria: '
  },
  resetAll: {
    zh: '重置所有',
    en: 'Reset All'
  },
  noFilteredResult: {
    zh: '暂无匹配内容',
    en: 'No Matching Content'
  },
  noFilteredResultDesc: {
    zh: '未发现符合条件的条目记录。未登录游客可尝试登录以解锁内部机密(internal)资产。',
    en: 'No matching entries found. Visitors can log in to safely unlock confidential (internal) data.'
  },

  // Detail Page
  lastModified: {
    zh: '最后修改时间',
    en: 'Last Modified'
  },
  authorLabel: {
    zh: '发布人ID',
    en: 'Author ID'
  },
  systemAdmin: {
    zh: '系统管理员',
    en: 'System (Admin)'
  },
  secBadgePublic: {
    zh: '公开可读',
    en: 'Publicly Readable'
  },
  secBadgeInternal: {
    zh: '内部机密',
    en: 'Internal Confidential'
  },
  backToCatalog: {
    zh: '返回条目目录',
    en: 'Back to Catalog'
  },
  editEntry: {
    zh: '二次编辑条目',
    en: 'Edit Archive Details'
  },
  attachmentsHeader: {
    zh: '资料与附件归档',
    en: 'Archived Files & Media'
  },
  tagsHeader: {
    zh: '条目索引标签',
    en: 'Indexed Tags'
  },
  noTags: {
    zh: '该知识档案包含 0 个主索引标签。',
    en: 'No search tags associated with this archive.'
  },
  sandboxHintHeader: {
    zh: '💡 MVP 拓展提示：',
    en: '💡 MVP Playground Info:'
  },
  sandboxHintDesc: {
    zh: '您在此处添加、删除或编辑附件文件时，后端将调用存储与索引接口。当前演示阶段已由 Client In-Memory 引擎完美支持并在 localStorage 中实时流转保存，满足老板演示和研发跨组模拟，极速测试无服务器开销。',
    en: 'Attachments added, updated, or deleted here are fully synced instantly inside localStorage sandbox memory for standalone, high-fidelity business simulations.'
  },

  // Asset Page
  assetLibraryTitle: {
    zh: '老板与市场部宣发素材库',
    en: 'Executive & Marketing Media Bank'
  },
  assetLibraryDesc: {
    zh: '本页汇集了可公开展示或内部汇报所需的业务流程图、概念剖析图、产品渲染图及各工厂实地防尘无菌生产线照片。',
    en: 'A high-res collection of flow diagrams, concept charts, product renderings, and real photos of micro-dust-free assembly lines.'
  },
  visitorBannerTitle: {
    zh: '当前处于未登录访客视图',
    en: 'Guest Visitor Restricted Screen'
  },
  visitorBannerDesc: {
    zh: '素材库中大多数流程剖析及厂房实地图均为 internal（内部机密）等级。退出登录时只能看到公开素材，请使用测试账户登入以完整检索和下载演示 PPT 矢量图。',
    en: 'Most strategic assets and factory photos are labeled internal. Guests can only inspect a limited catalog. Log in to unlock and download high-quality vector graphics.'
  },
  btnLoginUnlock: {
    zh: '登录完整解锁库',
    en: 'Log in to Unlock Library'
  },
  usageFilterLabel: {
    zh: '按推荐场景用途',
    en: 'Recommended Usage'
  },
  tagFilterLabel: {
    zh: '按素材结构标签',
    en: 'Structural Tags'
  },
  noAssetsFound: {
    zh: '暂无匹配素材',
    en: 'No Matching Media'
  },
  noAssetsFoundDesc: {
    zh: '本阶段未发现符合上述物理过滤属性的图纸素材记录。',
    en: 'No graphic files corresponding to specified parameters found.'
  },

  // Data Items Page
  dataItemPageTitle: {
    zh: '研发组协作：底层数据条目对准表',
    en: 'Co-Engineering: Core Data Item Spec Matrix'
  },
  dataItemPageDesc: {
    zh: '主要用于研发 A、B 组对准共享数据项定义、晶系规范、物理量字段映射，保障高鲁棒计算流转和 API 交换对准。',
    en: 'Synchronize sub-molecular fields, Bravais cell spaces, and physical constants to ensure API robustness and data pipeline correctness.'
  },
  dataItemsLockedTitle: {
    zh: '研发对齐数据字典已锁定',
    en: 'Co-Design Data Dictionary is Locked'
  },
  dataItemsLockedDesc: {
    zh: '由于涉及公司私域数据架构（包括晶胞空间群交换格式、分析时序数据库字段等），跨组对齐资料被标记为内部机密 (internal)。访客不可查看。请使用内部域账号登入访问。',
    en: 'To safeguard proprietary physics configurations (including subshell parameters and cluster indices), this database matrix is confidential. Log in to access.'
  },
  btnDomainLogin: {
    zh: '域账号身份登录解锁',
    en: 'LDAP SSO Login to Unlock'
  },
  btnPublishDataSpec: {
    zh: '发布新对齐数据定义',
    en: 'Publish Data Definition'
  },
  tableColTitle: {
    zh: '对齐索引条目',
    en: 'Aligned Wiki Topic'
  },
  tableColKey: {
    zh: '数据字典键 (Key Name)',
    en: 'Data Key Name'
  },
  tableColFormat: {
    zh: '交换格式',
    en: 'File Format'
  },
  tableColVersion: {
    zh: 'Schema 版本',
    en: 'SemVer Version'
  },
  tableColOwner: {
    zh: '第一负责人',
    en: 'Primary Engineer'
  },
  tableColModified: {
    zh: '更新时间',
    en: 'Sync Date'
  },
  tableColAction: {
    zh: '查看详情',
    en: 'Archive Details'
  },

  // Editor Page
  editorTitleNew: {
    zh: '起草公布新信息资产 & 知识库档案',
    en: 'Draft & Publish Information Resource'
  },
  editorTitleEdit: {
    zh: '编辑现有企业知识对准条目',
    en: 'Modify Existing Technical Archive'
  },
  editorSubtitle: {
    zh: '起草完成后，将立即部署并在系统内分发，支持多维度过滤检索。',
    en: 'Drafted assets are indexed instantly and propagated across the enterprise catalog with tags.'
  },
  formTitle: {
    zh: '条目公开发表标题 *',
    en: 'Archive Heading Title *'
  },
  formTitlePlaceholder: {
    zh: '请输入清晰且具辨识度的条目全名，如：薄膜原子表面化学沉积参数标准',
    en: 'Input a unique descriptor, e.g. Supramolecular chemical vapor deposition parameters'
  },
  formType: {
    zh: '条目核心分类类型 *',
    en: 'Core Resource Category *'
  },
  formVisibility: {
    zh: '查阅可见范围权限（隔离）*',
    en: 'Access Bounds (Security Isolation) *'
  },
  formSummary: {
    zh: '简短场景摘要（在列表卡片及目录中精简透出）- 最少五个字 *',
    en: 'Brief Context Abstract (rendered in grid list context) - Min 5 chars *'
  },
  formSummaryPlaceholder: {
    zh: '请输入该篇 Wiki 的业务背景或目标概述（多行简短说明文字）...',
    en: 'Type a brief summary explaining corporate reasons or business objectives...'
  },
  formContent: {
    zh: '条目核心完整正文内容（支持 Markdown / 换行）*',
    en: 'Detailed Body Content (Full Markdown Supported) *'
  },
  formContentPlaceholder: {
    zh: '请输入 Wiki 条目核心详尽介绍。支持使用 ### 三级标题分段叙述等规范排版...',
    en: 'Provide thorough documentation here. Markdown headers, lists, and links are fully active...'
  },
  formTags: {
    zh: '索引关联标签',
    en: 'Taxonomy/Index Tags'
  },
  formTagsPlaceholder: {
    zh: '例如: 客户展示, 算法, PPT素材 (逗号隔开)',
    en: 'e.g., Client Show, Algorithm, Flowchart (Split by comma)'
  },
  formCategorySelect: {
    zh: '业务归档类别目录',
    en: 'Business Catalog Folder'
  },
  btnSaveArchive: {
    zh: '审核并发表该 Wiki 条目',
    en: 'Publish & Index Archive'
  },
  btnCancel: {
    zh: '放弃修改',
    en: 'Discard Changes'
  },

  // Login Page
  loginPageTitle: {
    zh: '公司信息对准平台安全网关',
    en: 'Corporate Secure SSO Gateway'
  },
  loginPageSubtitle: {
    zh: '使用内部配发的企业域账号安全登录，以解锁特许素材及研发协作字段对齐。',
    en: 'Authenticate using standard staff credentials to unlock internal media vaults and R&D specs.'
  },
  lblUsername: {
    zh: '企业域账号 (Username)',
    en: 'SSO Username'
  },
  lblPassword: {
    zh: '安全登录凭证 (Password)',
    en: 'Security Password'
  },
  tipAccountDetails: {
    zh: '💡 研发/管理内部测试账号：',
    en: '💡 Standard Mock Accounts for Testing:'
  },
  tipTester: {
    zh: '管理员域账号: admin | 密码: admin123',
    en: 'Sandbox Admin Account: admin | Password: admin123'
  },
  btnLoginSubmit: {
    zh: '安全进行物理验证登录',
    en: 'Decrypt & Verify Login'
  },
  loginFailedMsg: {
    zh: '域用户名或密码密码哈希比对失败！请使用 admin / admin123 接入。',
    en: 'LDAP authentication check failed! Please verify spelling of admin / admin123.'
  },

  // Admin Page
  adminPanelTitle: {
    zh: '系统管理员专区：Mock 数据库与架构白皮书',
    en: 'Unified Admin Command: Mock Database & Architecture Schema'
  },
  adminPanelDesc: {
    zh: '本页面向架构师和企业内部运维提供当前系统的 Mock Data 监控度量，并详细公示了后续直接无缝导入 SQLite/PostgreSQL 时的物理结构表字典。',
    en: 'Monitors simulation footprints, measures telemetry records, and documents equivalent database schemas for production migration.'
  },
  adminAcountCount: {
    zh: '管理员账户',
    en: 'Admin Accounts'
  },
  adminWikiCount: {
    zh: 'Wiki 条目总数',
    en: 'Archived Topics'
  },
  adminFileCount: {
    zh: '关联素材附件',
    en: 'Media Attachments'
  },
  adminDistribution: {
    zh: '知识条目分布现状统计',
    en: 'Archived Distribution Telemetry'
  },

  // General Buttons or small utilities
  unauthorizedTitle: {
    zh: '⚠️ 无法查阅内部机密资产',
    en: '⚠️ Access Denied: Confidential Data'
  },
  unauthorizedSubtitle: {
    zh: '该条目被管理员限定为内部研发级 (internal) 可见。当前您还是外客访客身份，已被服务端物理拦截。',
    en: 'This resource is restricted to authorized teams only. Your guest token was physically rejected.'
  },
  btnBackHome: {
    zh: '回公开首页',
    en: 'Back to Home'
  },

  // AI Features
  aiSearchToggle: {
    zh: 'AI 语义搜索',
    en: 'AI Semantic Search'
  },
  aiSearchPlaceholder: {
    zh: '用自然语言描述你想找的内容...',
    en: 'Describe what you\'re looking for in natural language...'
  },
  aiSearchBtn: {
    zh: 'AI 搜索',
    en: 'AI Search'
  },
  aiSearching: {
    zh: 'AI 正在分析语义...',
    en: 'AI analyzing semantics...'
  },
  aiSearchFallback: {
    zh: 'AI 未返回结果，已切换到关键词匹配',
    en: 'AI returned no results, switched to keyword match'
  },
  aiChatTitle: {
    zh: 'Wiki AI 助手',
    en: 'Wiki AI Assistant'
  },
  aiChatPlaceholder: {
    zh: '输入你的问题...',
    en: 'Ask a question...'
  },
  aiChatWelcome: {
    zh: '你好！我是 Wiki AI 助手，可以帮你搜索条目、回答问题。试试问我关于公司产品、技术或专利的问题吧。',
    en: 'Hi! I\'m the Wiki AI assistant. Ask me about company products, technologies, or patents.'
  },
  aiChatThinking: {
    zh: '思考中...',
    en: 'Thinking...'
  },
  aiSummarizeBtn: {
    zh: 'AI 摘要',
    en: 'AI Summarize'
  },
  aiSummarizing: {
    zh: '生成摘要中...',
    en: 'Generating summary...'
  },
  aiError: {
    zh: 'AI 服务不可用，请确保 Ollama 已启动',
    en: 'AI service unavailable. Please ensure Ollama is running.'
  }
};

interface LanguageThemeContextType {
  theme: Theme;
  lang: Lang;
  toggleTheme: () => void;
  setLang: (lang: Lang) => void;
  t: (key: keyof typeof translations) => string;
}

const LanguageThemeContext = createContext<LanguageThemeContextType | undefined>(undefined);

export const LanguageThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('microera_theme');
    return (saved as Theme) || 'light';
  });

  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('microera_lang');
    return (saved as Lang) || 'zh';
  });

  useEffect(() => {
    // Sync class on document root for Tailwind support
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('microera_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('microera_lang', lang);
  }, [lang]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
  };

  const t = (key: keyof typeof translations): string => {
    const translation = translations[key];
    if (!translation) return key as string;
    return translation[lang] || translation['zh'] || key;
  };

  return (
    <LanguageThemeContext.Provider
      value={{
        theme,
        lang,
        toggleTheme,
        setLang,
        t,
      }}
    >
      {children}
    </LanguageThemeContext.Provider>
  );
};

export const useLanguageTheme = () => {
  const context = useContext(LanguageThemeContext);
  if (context === undefined) {
    throw new Error('useLanguageTheme must be used within a LanguageThemeProvider');
  }
  return context;
};
