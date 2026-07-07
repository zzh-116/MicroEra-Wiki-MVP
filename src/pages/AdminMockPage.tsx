import React, { useEffect, useState } from 'react';
import { Entry } from '../types/entry';
import { WikiFile } from '../types/file';
import { DataItem } from '../types/dataItem';
import { entriesApi } from '../api/entriesApi';
import { filesApi } from '../api/filesApi';
import { dataItemsApi } from '../api/dataItemsApi';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { 
  AppWindow, 
  Database, 
  Users, 
  Files, 
  BarChart4, 
  Terminal, 
  BookOpen, 
  Unlock, 
  Lock,
  GitCommit,
  HardDrive
} from 'lucide-react';

export const AdminMockPage: React.FC = () => {
  const { lang } = useLanguageTheme();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [dataItems, setDataItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const fetchedEntries = await entriesApi.getEntries({ visibility: 'all' }); 
        const fetchedFiles = await filesApi.getFiles();
        const fetchedData = await dataItemsApi.getDataItems();

        setEntries(fetchedEntries);
        setFiles(fetchedFiles);
        setDataItems(fetchedData);
      } catch (e) {
        console.error('Failed to resolve system administrative figures', e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const totalEntries = entries.length;
  const publicCount = entries.filter((e) => e.visibility === 'public').length;
  const internalCount = entries.filter((e) => e.visibility === 'internal').length;

  const typeCounts = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.entry_type] = (acc[entry.entry_type] || 0) + 1;
    return acc;
  }, {});

  const typeLabelMap: Record<string, string> = lang === 'zh' ? {
    product: '🏢 产品与业务',
    tech: '⚙️ 技术研发能力',
    patent: '📜 学术/成果专利',
    asset: '🎨 展示素材图解',
    data_item: '🧬 对齐数据字典'
  } : {
    product: '🏢 Sales & Products',
    tech: '⚙️ R&D Capabilities',
    patent: '📜 Academic IP Patents',
    asset: '🎨 Media/Slides Deck',
    data_item: '🧬 Data Dict Schema'
  };

  const sqliteTables = [
    {
      name: 'users',
      purpose: lang === 'zh' ? '存储内部用户信息，提供 LDAP 或双因素密码验证。' : 'Stores internal corporate profiles supporting LDAP authentication simulation.',
      fields: [
        { name: 'id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT', desc: lang === 'zh' ? '用户唯一密码主键' : 'Auto-incremental unique ID' },
        { name: 'username', type: 'TEXT NOT NULL UNIQUE', desc: lang === 'zh' ? '企业 LDAP 域账号名（演示系统写死：admin）' : 'Official LDAP domain identifier (e.g., admin)' },
        { name: 'password_hash', type: 'TEXT NOT NULL', desc: lang === 'zh' ? '密码哈希，数字签名字串（密码：admin123）' : 'LDAP verify hash (e.g. admin123)' },
        { name: 'display_name', type: 'TEXT', desc: lang === 'zh' ? '用户真实名称，展示在操作栏' : 'Human display name for dashboard greetings' },
        { name: 'created_at', type: 'TEXT', desc: lang === 'zh' ? '对应账号激活注册时间' : 'Account creation timestamp ISO-8601' }
      ]
    },
    {
      name: 'entries',
      purpose: lang === 'zh' ? '最核心存储表，涵盖多类别的 Wiki 描述、主要大正文文本及可见度属性。' : 'Primary store table aggregating title, abstract summaries, rich markdown texts, and privacy bits.',
      fields: [
        { name: 'id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT', desc: lang === 'zh' ? '条目唯一自增主键' : 'Incremental unique entry ID key' },
        { name: 'title', type: 'TEXT NOT NULL', desc: lang === 'zh' ? 'Wiki 发表标题' : 'Display entry title supporting text lookups' },
        { name: 'entry_type', type: 'TEXT NOT NULL', desc: lang === 'zh' ? '类型 (asset, product, tech, patent, data_item)' : 'Type group discriminant values' },
        { name: 'summary', type: 'TEXT', desc: lang === 'zh' ? '摘要说明，展示在网格面板' : 'Context outline displayed in the showcase grid' },
        { name: 'content', type: 'TEXT', desc: lang === 'zh' ? 'Markdown 正文，最大存储空间 4GB TEXT' : 'Detailed text body (Supports massive Markdown)' },
        { name: 'visibility', type: 'TEXT NOT NULL', desc: lang === 'zh' ? '可见度隔离 (public, internal)' : 'Visibility level restriction (public, internal)' },
        { name: 'category_id', type: 'INTEGER', desc: lang === 'zh' ? '指向 categories 外键' : 'Foreign key mappings to category catalog items' },
        { name: 'created_at', type: 'TEXT', desc: lang === 'zh' ? '起草时间 (ISO-8601)' : 'Publish date' },
        { name: 'updated_at', type: 'TEXT', desc: lang === 'zh' ? '修编更新时间 (ISO-8601)' : 'Latest correction date' }
      ]
    },
    {
      name: 'files',
      purpose: lang === 'zh' ? '物理附件表。管理对应的 PPT/照片，物理实体保存在本地 uploads 物理分区。' : 'Asset attachment relation table. Keeps file metadata mapped to specific local binary paths.',
      fields: [
        { name: 'id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT', desc: lang === 'zh' ? '文件主键' : 'Asset sequence ID' },
        { name: 'entry_id', type: 'INTEGER NOT NULL', desc: lang === 'zh' ? '外键对应 entries.id' : 'Mapped entry_id back to parent article' },
        { name: 'original_filename', type: 'TEXT NOT NULL', desc: lang === 'zh' ? '附件原始上传文件名' : 'Raw file name uploaded by maintainer' },
        { name: 'stored_filename', type: 'TEXT NOT NULL', desc: lang === 'zh' ? '保存在系统的 UUID 避重名' : 'Unique disk filename generated to avoid crashes' },
        { name: 'file_type', type: 'TEXT', desc: lang === 'zh' ? 'MIME 类型' : 'Standard file MIME descriptor' },
        { name: 'file_size', type: 'INTEGER', desc: lang === 'zh' ? '文件字节数，系统统计容量' : 'Internal byte-count for space reports' },
        { name: 'storage_path', type: 'TEXT NOT NULL', desc: lang === 'zh' ? '在磁盘上的相对物理检索路径' : 'Relative pathway index inside filesystem storage' },
        { name: 'usage_type', type: 'TEXT', desc: lang === 'zh' ? '用途类型 (PPT素材、宣发素材、客户展示、内部归档)' : 'Pre-assigned group usage filter' },
        { name: 'created_at', type: 'TEXT', desc: lang === 'zh' ? '文件写入硬盘的时间' : 'Uploaded timestamp' }
      ]
    },
    {
      name: 'data_items',
      purpose: lang === 'zh' ? '空间群 CIF 数据对准、原子规范预测时对 entries 的 1对1 辅助规格扩展对齐表。' : 'One-to-one auxiliary schema extensions for DFT calculations, unit groups, and data alignment.',
      fields: [
        { name: 'id', type: 'INTEGER PRIMARY KEY AUTOINCREMENT', desc: lang === 'zh' ? '子表项主键' : 'Primary sequence key' },
        { name: 'entry_id', type: 'INTEGER NOT NULL', desc: lang === 'zh' ? '一对一映射 entries.id 外键' : 'Unique 1-on-1 foreign key map' },
        { name: 'data_name', type: 'TEXT', desc: lang === 'zh' ? '数据契约代码，如 BravaisMolecule' : 'Shared schema code name' },
        { name: 'data_definition', type: 'TEXT', desc: lang === 'zh' ? '跨组共享场景对准的物理定义与边界' : 'Clear bounds of shared variables scenario definitions' },
        { name: 'data_format', type: 'TEXT', desc: lang === 'zh' ? '物理格式 (csv, json, sql, cif, excel)' : 'Format extension categories' },
        { name: 'storage_description', type: 'TEXT', desc: lang === 'zh' ? '物理存储集群的具体服务器路径索引' : 'Absolute cluster directory route reference' },
        { name: 'schema_description', type: 'TEXT', desc: lang === 'zh' ? 'JSON 格式字段规范 schema 树集' : 'JSON specifications of properties mapping specs' },
        { name: 'schema_version', type: 'TEXT', desc: lang === 'zh' ? '语义版本 SemVer' : 'SemVer identifier tag' },
        { name: 'responsible_person', type: 'TEXT', desc: lang === 'zh' ? '第一研发对接负责人(如 A组李工)' : 'Active developer on-duty maintainer' },
        { name: 'updated_at', type: 'TEXT', desc: lang === 'zh' ? '扩展表最近核验时间' : 'Modified timestamp' }
      ]
    }
  ];

  return (
    <div className="space-y-8" id="admin-mock-panel">
      
      {/* Page Header */}
      <div className="border-b border-theme-border pb-5">
        <h1 className="text-lg sm:text-xl font-extrabold text-theme-text font-sans tracking-tight flex items-center gap-2">
          <Terminal className="text-brand-indigo dark:text-brand-yellow w-5 h-5" />
          {lang === 'zh' ? '系统管理员专区：Mock 数据库与架构白皮书' : 'Admin: Sandbox Telemetry & Schema Specs'}
        </h1>
        <p className="text-xs text-theme-muted mt-1 select-text">
          {lang === 'zh' 
            ? '本页面向企业系统运维与算法架构师提供当前前端模拟数据库监控指标，并详细公示了后续无缝对接关系型/SQLite数据库时的物理表规矩结构。' 
            : 'Explore diagnostic sandbox storage statistics and read pre-configured corporate DB schemas maps directly.'}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-10 font-mono text-xs text-theme-muted animate-pulse">
          Gathering storage telemetry metrics...
        </div>
      ) : (
        <>
          {/* stats widgets grid columns */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 sm:gap-4 select-none">
            
            <div className="bg-theme-card border border-theme-border p-4 rounded-xl flex items-center gap-3 shadow-xs transition-colors">
              <div className="w-8.5 h-8.5 bg-theme-bg rounded-lg flex items-center justify-center border border-theme-border flex-shrink-0">
                <Users className="w-4 h-4 text-brand-coral" />
              </div>
              <div className="truncate">
                <span className="text-[9px] text-theme-muted uppercase font-mono block">{lang === 'zh' ? '运行账户' : 'LDAP User'}</span>
                <strong className="text-xs sm:text-sm text-theme-text font-mono font-extrabold block">admin (System)</strong>
              </div>
            </div>

            <div className="bg-theme-card border border-theme-border p-4 rounded-xl flex items-center gap-3 shadow-xs transition-colors">
              <div className="w-8.5 h-8.5 bg-theme-bg rounded-lg flex items-center justify-center border border-theme-border flex-shrink-0">
                <BookOpen className="w-4 h-4 text-[#DB5F5B]" />
              </div>
              <div>
                <span className="text-[9px] text-theme-muted uppercase font-mono block">{lang === 'zh' ? '全谱条目' : 'All Wiki'}</span>
                <strong className="text-xs sm:text-sm text-theme-text font-mono font-extrabold block">{totalEntries} {lang === 'zh' ? '篇' : 'Pcs'}</strong>
              </div>
            </div>

            <div className="bg-theme-card border border-theme-border p-4 rounded-xl flex items-center gap-3 shadow-xs transition-colors">
              <div className="w-8.5 h-8.5 bg-theme-bg rounded-lg flex items-center justify-center border border-theme-border flex-shrink-0">
                <Files className="w-4 h-4 text-brand-yellow" />
              </div>
              <div>
                <span className="text-[9px] text-theme-muted uppercase font-mono block">{lang === 'zh' ? '关联素材' : 'Attachments'}</span>
                <strong className="text-xs sm:text-sm text-theme-text font-mono font-extrabold block">{files.length} {lang === 'zh' ? '个' : 'Files'}</strong>
              </div>
            </div>

            <div className="bg-theme-card border border-theme-border p-4 rounded-xl flex items-center gap-3 shadow-xs transition-colors">
              <div className="w-8.5 h-8.5 bg-brand-yellow/10 text-brand-indigo dark:text-brand-yellow rounded-lg flex items-center justify-center border border-brand-yellow/20 flex-shrink-0">
                <Unlock className="w-4 h-4 text-brand-yellow" />
              </div>
              <div>
                <span className="text-[9px] text-theme-muted uppercase font-mono block">{lang === 'zh' ? '公开属性' : 'Public'}</span>
                <strong className="text-xs sm:text-sm text-theme-text font-mono font-extrabold block">{publicCount} {lang === 'zh' ? '篇' : 'Pcs'}</strong>
              </div>
            </div>

            <div className="col-span-2 md:col-span-1 bg-theme-card border border-theme-border p-4 rounded-xl flex items-center gap-3 shadow-xs transition-colors">
              <div className="w-8.5 h-8.5 bg-brand-coral/10 text-brand-coral rounded-lg flex items-center justify-center border border-brand-coral/20 flex-shrink-0">
                <Lock className="w-4 h-4 text-brand-coral" />
              </div>
              <div>
                <span className="text-[9px] text-theme-muted uppercase font-mono block">{lang === 'zh' ? '内部机密' : 'Confidential'}</span>
                <strong className="text-xs sm:text-sm text-theme-text font-mono font-bold block">{internalCount} {lang === 'zh' ? '篇' : 'Protected'}</strong>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Type breakdown charting block - Left side 4 columns */}
            <div className="lg:col-span-4 bg-theme-card border border-theme-border p-5 rounded-xl shadow-xs space-y-4 transition-colors">
              <h3 className="text-xs font-bold text-theme-muted font-mono uppercase tracking-wider flex items-center gap-2">
                <BarChart4 className="w-4 h-4 text-brand-coral" />
                <span>{lang === 'zh' ? '分类知识档案分布监控' : 'Showcase Category Distributions'}</span>
              </h3>

              <div className="space-y-3.5 pt-2">
                {Object.keys(typeLabelMap).map((type) => {
                  const label = typeLabelMap[type];
                  const count = typeCounts[type] || 0;
                  const ratio = totalEntries > 0 ? (count / totalEntries) * 100 : 0;
                  
                  return (
                    <div key={type} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between text-theme-text font-bold">
                        <span>{label}</span>
                        <span className="font-mono text-brand-coral">{count} {lang === 'zh' ? '篇' : ''} ({ratio.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-theme-bg border border-theme-border rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-brand-indigo dark:bg-brand-yellow h-full rounded-full transition-all duration-500" 
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Informational warning */}
              <div className="bg-theme-bg border border-theme-border p-4 rounded-lg text-xs font-sans leading-relaxed text-theme-muted space-y-1.5 transition-colors">
                <div className="flex items-center gap-1.5 text-theme-text font-extrabold">
                  <HardDrive className="w-4 h-4 text-brand-yellow animate-pulse" />
                  <span>{lang === 'zh' ? '持久化流转沙盒架构' : 'Sandboxed Local Persistence'}</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {lang === 'zh' 
                    ? '当前系统数据完全托管于 LocalStorage 与前端 In-Memory 仿真器，所有的新增、更新、修编动作均可在多角色与语言模式下 100% 隔离闭环。无需搭建传统服务器，也避免数据库崩溃，完美流转演示！' 
                    : 'Changes store securely inside memory-state synchronized with localStorage. Effortlessly toggle login states, languages or modify wiki logs with confidence!'}
                </p>
              </div>
            </div>

            {/* Schema Table detail spec - Right side 8 columns */}
            <div className="lg:col-span-8 bg-theme-card border border-theme-border p-5 rounded-xl shadow-xs space-y-6 transition-colors">
              
              <div className="flex items-center gap-2 pb-1 border-b border-theme-border">
                <Database className="w-5 h-5 text-brand-indigo dark:text-brand-yellow" />
                <div>
                  <h3 className="text-xs font-bold text-theme-muted font-mono uppercase tracking-wider">
                    {lang === 'zh' ? '备用 SQLite / SQL 物理表契约结构说明书' : 'Relation Tables Contracts for SQLite & Postgres'}
                  </h3>
                  <span className="text-[10px] text-theme-muted font-sans block mt-0.5">
                    {lang === 'zh' 
                      ? '以下列出的数据结构与核心表定义已经完美对准，便于日后进行真正的零修改无摩擦后端迁移。' 
                      : 'The following declarative rules are completely compatible with standard SQL platforms.'}
                  </span>
                </div>
              </div>

              {/* SQLite detail blocks */}
              <div className="space-y-5" id="sqlite-table-definitions">
                {sqliteTables.map((tbl, idx) => (
                  <div key={idx} className="border border-theme-border rounded-lg overflow-hidden bg-theme-bg">
                    <div className="bg-theme-card border-b border-theme-border px-3.5 py-2.5 flex items-center gap-1.5 select-none font-mono text-xs font-extrabold text-theme-text justify-between">
                      <span>🗄️ SQL Schema Table: {tbl.name}</span>
                      <span className="text-[9px] font-sans text-theme-muted bg-theme-bg border border-theme-border px-1.5 py-0.5 rounded font-bold">
                        Compat
                      </span>
                    </div>

                    <div className="p-3.5 space-y-2.5">
                      <p className="text-[11px] text-theme-muted leading-relaxed font-semibold">
                        {lang === 'zh' ? '核心任务用途：' : 'Description: '}{tbl.purpose}
                      </p>

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-[11px] font-sans text-theme-text">
                          <thead className="text-[9px] font-bold text-theme-muted uppercase tracking-wider font-mono border-b border-theme-border bg-theme-card">
                            <tr>
                              <th className="py-1.5 px-2.5 font-extrabold">{lang === 'zh' ? '字段键 (Column)' : 'Column'}</th>
                              <th className="py-1.5 px-2.5 font-extrabold">{lang === 'zh' ? '物理字段属性' : 'Type'}</th>
                              <th className="py-1.5 px-2.5 font-extrabold">{lang === 'zh' ? '业务场景规范剖析' : 'Usage Specs'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-theme-border bg-theme-card">
                            {tbl.fields.map((fld, fIdx) => (
                              <tr key={fIdx} className="hover:bg-theme-bg/10">
                                <td className="py-1.5 px-2.5 font-mono font-extrabold text-[#DB5F5B]">{fld.name}</td>
                                <td className="py-1.5 px-2.5 font-mono text-brand-coral text-[10px] sm:text-[11px]">{fld.type}</td>
                                <td className="py-1.5 px-2.5 text-theme-muted font-medium">{fld.desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>

          </div>
        </>
      )}

    </div>
  );
};
