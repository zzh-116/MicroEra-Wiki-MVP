import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { graphApi } from '../api/graphApi';
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '../types/wiki';
import { useConversation } from '../hooks/useConversation';
import { storage } from '../lib/storage';
import KnowledgeGraph from '../components/KnowledgeGraph';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import {
  Sparkles, BookOpen, Atom, Globe, Database, ChevronRight,
  X, Network, Lightbulb, Zap, Brain, Cpu, Layers, Search,
  MessageSquare, ArrowRight
} from 'lucide-react';

const AI_PAGE_ID = 'global-ai-query';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  {
    icon: Cpu,
    text: '什么是稳定子算法？它是如何进行纠错的？',
    category: '量子计算',
  },
  {
    icon: Layers,
    text: 'MOF-303 的合成方法和产量情况？',
    category: '材料科学',
  },
  {
    icon: Brain,
    text: '量子纠错项目的商业转化价值是多少？',
    category: '商业分析',
  },
  {
    icon: Search,
    text: '最近上传的纠错码相关论文有哪些？',
    category: '文献检索',
  },
  {
    icon: Zap,
    text: '解释 Hamiltonian 模拟的核心原理',
    category: '物理计算',
  },
  {
    icon: Lightbulb,
    text: '总结 Sandbox 稳定子项目的最新实验结果',
    category: '项目分析',
  },
];

const KNOWLEDGE_SOURCES = [
  { icon: Atom, label: 'arXiv 预印本' },
  { icon: Globe, label: 'CrossRef' },
  { icon: Database, label: 'Sandbox 项目' },
  { icon: BookOpen, label: '企业文档' },
];

const QUICK_PROMPTS = ['总结要点', '翻译成英文', '生成报告', '解释原理'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIQueryPage() {
  const { isLoggedIn } = useAuth();
  const [globalGraph, setGlobalGraph] = useState<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }>({ nodes: [], edges: [] });
  const [graphPanelOpen, setGraphPanelOpen] = useState(false);

  const chat = useConversation(AI_PAGE_ID);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // ── Load global graph ─────────────────────────────────────────────────────
  useEffect(() => {
    graphApi.getGlobalGraph().then((g) => setGlobalGraph(g)).catch(() => {});
  }, []);

  // ── Quick question from other pages ───────────────────────────────────────
  useEffect(() => {
    const quickQ = storage.getQuickQuestion();
    if (quickQ) {
      storage.removeQuickQuestion();
      chat.send(quickQ);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── No auto-scroll — user controls scrolling manually ────────────────────

  // ── Auto-open graph panel when sources are referenced ─────────────────────
  const lastMessage = chat.messages.filter((m) => m.role === 'assistant').pop();
  const hasSources = (lastMessage?.sources?.length || 0) > 0;

  useEffect(() => {
    if (hasSources && !graphPanelOpen) {
      setGraphPanelOpen(true);
    }
  }, [hasSources]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEmpty = chat.messages.length === 0;

  // ── Thinking steps (derived during loading) ───────────────────────────────
  const thinkingSteps = chat.isLoading
    ? ['检索知识库', '匹配相关文档', '阅读理解上下文', '生成回答']
    : undefined;

  // ── Generate follow-up suggestions ────────────────────────────────────────
  const generateFollowUps = (): string[] => {
    return ['能详细解释一下吗？', '有哪些相关论文？', '总结成三个要点'];
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSend = (message: string) => {
    chat.send(message);
  };

  const handleQuickPrompt = (prompt: string) => {
    chat.send(prompt);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-140px)] -mx-4 sm:mx-0" id="ai-query-page-panel">
      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER BAR (compact, always visible)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#DB5F5B]/10">
            <Sparkles className="w-3.5 h-3.5 text-[#DB5F5B]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-sm font-bold text-[#2B3150] font-display">MiQi AI</h1>
            <p className="text-[10px] text-gray-400">企业知识库智能问答</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Graph toggle */}
          <button
            onClick={() => setGraphPanelOpen(!graphPanelOpen)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
              graphPanelOpen
                ? 'bg-[#DB5F5B]/5 text-[#DB5F5B] border border-[#DB5F5B]/10'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent'
            }`}
          >
            <Network className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">知识图谱</span>
          </button>

          {/* New chat */}
          {!isEmpty && (
            <button
              onClick={chat.newChat}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium
                         text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent transition-all"
            >
              <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">新对话</span>
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN AREA: Conversation + Graph Panel
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex min-h-0">
        {/* ── Conversation ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-4 sm:px-6 py-6"
          >
            <div className="max-w-3xl mx-auto">
              {/* ── Empty State ────────────────────────────────────────────── */}
              {isEmpty && (
                <div className="flex flex-col items-center justify-center min-h-[60vh] py-8">
                  {/* MIQi branding */}
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#DB5F5B]/10 to-[#DB5F5B]/20 mb-5">
                    <Sparkles className="w-8 h-8 text-[#DB5F5B]" aria-hidden="true" />
                  </div>
                  <h2 className="text-xl font-bold text-[#2B3150] font-display mb-1.5">
                    MiQi AI 智能问答
                  </h2>
                  <p className="text-sm text-gray-500 max-w-md text-center leading-relaxed mb-8">
                    基于企业知识库的 AI 研究助手 — 检索 Sandbox 项目、学术论文、数据标准与内部文档，提供溯源级回答。
                  </p>

                  {/* Suggested questions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl mb-8">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q.text}
                        onClick={() => handleSend(q.text)}
                        className="group flex items-start gap-3 p-3.5 bg-white border border-gray-200 rounded-xl
                                   hover:border-[#DB5F5B]/30 hover:shadow-sm hover:-translate-y-0.5
                                   transition-all duration-150 text-left"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50
                                        group-hover:bg-[#DB5F5B]/10 shrink-0 transition-colors">
                          <q.icon className="w-4 h-4 text-gray-400 group-hover:text-[#DB5F5B] transition-colors" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-gray-500 mb-0.5">{q.category}</p>
                          <p className="text-xs text-gray-700 leading-snug line-clamp-2">{q.text}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Knowledge sources */}
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span className="font-semibold uppercase tracking-wide">知识来源：</span>
                    {KNOWLEDGE_SOURCES.map((s) => (
                      <span key={s.label} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full">
                        <s.icon className="w-3 h-3" aria-hidden="true" />
                        {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Message List ───────────────────────────────────────────── */}
              {!isEmpty && (
                <div className="space-y-1">
                  {chat.messages.map((msg) => (
                    <div key={msg.id}>
                      <MessageBubble
                        role={msg.role}
                        content={msg.content}
                        timestamp={msg.timestamp}
                        sources={msg.sources}
                        onSourceClick={chat.navigateToSource}
                        thinkingSteps={
                          msg.role === 'assistant' && chat.isLoading && msg === chat.messages[chat.messages.length - 1]
                            ? thinkingSteps
                            : undefined
                        }
                        followUps={
                          msg.role === 'assistant' && !chat.isLoading && msg.content && msg === chat.messages[chat.messages.length - 1]
                            ? generateFollowUps()
                            : undefined
                        }
                        onFollowUp={handleSend}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Loading indicator for initial response */}
              {chat.isLoading && chat.messages.length <= 1 && (
                <div className="flex items-start gap-3 mb-5 animate-fade-in">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#DB5F5B]/10 to-[#DB5F5B]/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-[#DB5F5B]" aria-hidden="true" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-gray-400 mb-1">MiQi AI</p>
                    <div className="flex items-center gap-1 px-1 py-2">
                      <span className="w-2 h-2 bg-[#DB5F5B] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-[#DB5F5B] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-[#DB5F5B] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── Input Area ──────────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-gray-100 bg-white px-4 sm:px-6 py-3">
            <div className="max-w-3xl mx-auto">
              <ChatInput
                onSubmit={handleSend}
                disabled={chat.isLoading}
                placeholder="输入您的问题，MiQi AI 将从企业知识库中检索并回答…"
                multiline
                quickPrompts={QUICK_PROMPTS}
                onQuickPrompt={handleQuickPrompt}
                onClear={!isEmpty ? chat.newChat : undefined}
              />
            </div>
          </div>
        </div>

        {/* ── Knowledge Graph Panel ────────────────────────────────────────── */}
        {graphPanelOpen && (
          <aside className="hidden lg:block w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-[#DB5F5B]" aria-hidden="true" />
                知识图谱
              </h3>
              <button
                onClick={() => setGraphPanelOpen(false)}
                className="p-1 rounded hover:bg-gray-100 transition-colors"
                aria-label="关闭知识图谱"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>

            <div className="p-3 space-y-4">
              {/* Graph visualization */}
              <div className="bg-gray-50/50 border border-gray-100 rounded-lg overflow-hidden">
                <KnowledgeGraph
                  nodes={globalGraph.nodes.slice(0, 12)}
                  edges={globalGraph.edges.slice(0, 11)}
                  height={220}
                  interactive={false}
                />
              </div>

              {/* Referenced nodes */}
              {lastMessage?.sources && lastMessage.sources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    本次引用节点
                  </p>
                  <div className="space-y-1">
                    {lastMessage.sources.slice(0, 5).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => chat.navigateToSource(s.id)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-[#1D70B8]
                                   hover:bg-[#DB5F5B]/5 rounded-md transition-all text-left"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#DB5F5B] shrink-0" />
                        <span className="truncate">{s.title}</span>
                        <ArrowRight className="w-3 h-3 shrink-0 ml-auto text-gray-300" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Knowledge source stats */}
              <div className="bg-[#F5F6E5]/20 border border-gray-100 rounded-lg p-3 space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">知识库状态</p>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-white rounded-md p-2 border border-gray-100 text-center">
                    <p className="font-bold text-[#2B3150] font-mono">{globalGraph.nodes.length}</p>
                    <p className="text-gray-400">知识节点</p>
                  </div>
                  <div className="bg-white rounded-md p-2 border border-gray-100 text-center">
                    <p className="font-bold text-[#2B3150] font-mono">{globalGraph.edges.length}</p>
                    <p className="text-gray-400">关联边</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
