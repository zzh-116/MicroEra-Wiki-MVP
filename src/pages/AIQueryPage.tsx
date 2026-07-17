import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { graphApi } from '../api/graphApi';
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '../types/wiki';
import { useConversation } from '../hooks/useConversation';
import { storage } from '../lib/storage';
import ConversationPanel from '../components/ConversationPanel';
import KnowledgeGraph from '../components/KnowledgeGraph';
import { Sparkles, MessageSquare } from 'lucide-react';

const AI_PAGE_ID = 'global-ai-query';

export default function AIQueryPage() {
  const { isLoggedIn } = useAuth();
  const [globalGraph, setGlobalGraph] = useState<{ nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }>({ nodes: [], edges: [] });

  // Use the same conversation hook as entry pages
  const chat = useConversation(AI_PAGE_ID);

  // Load global graph
  useEffect(() => {
    graphApi.getGlobalGraph().then((g) => setGlobalGraph(g)).catch(() => {});
  }, []);

  // Check if a quick question was routed from another page
  useEffect(() => {
    const quickQ = storage.getQuickQuestion();
    if (quickQ) {
      storage.removeQuickQuestion();
      chat.send(quickQ);
    }
  }, []);

  return (
    <div className="space-y-5" id="ai-query-page-panel">
      <div className="space-y-1">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1 uppercase tracking-wide">
          <Sparkles className="w-5 h-5 text-[#DB5F5B] animate-pulse" />
          <span>MiQi 智能科研 RAG 问答中枢</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          基于 Sandbox 输出、文档缓存及向量 Embedding 库的溯源级解答。支持多轮对话，后续提问自动携带上文。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chat — unified ConversationPanel, same as entry detail */}
        <div className="lg:col-span-8">
          <div className="bg-white border border-[#DB5F5B]/10 rounded-xl shadow-sm" style={{ minHeight: '500px' }}>
            <ConversationPanel
              messages={chat.messages}
              onSend={chat.send}
              isLoading={chat.isLoading}
              onSourceClick={chat.navigateToSource}
              onNewChat={chat.newChat}
            />
          </div>
        </div>

        {/* Right sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <h3 className="font-extrabold text-xs text-gray-800 pb-1.5 border-b border-gray-100 mb-2 uppercase tracking-wide">
              检索相关的知识节点网络
            </h3>
            <KnowledgeGraph
              nodes={globalGraph.nodes.slice(0, 10)}
              edges={globalGraph.edges.slice(0, 9)}
              height={190}
              interactive={false}
            />
          </div>

          {/* Quick question shortcuts */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <h3 className="font-extrabold text-xs text-gray-800 pb-1.5 border-b border-gray-100 mb-2 uppercase tracking-wide flex items-center">
              <MessageSquare className="w-3.5 h-3.5 mr-1 text-[#DB5F5B]" />
              建议提问
            </h3>
            <div className="space-y-1">
              {[
                '什么是稳定子算法？它是如何进行纠错的？',
                'MOF-303 的合成方法和产量情况？',
                '量子纠错项目的商业转化价值是多少？',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => chat.send(q)}
                  disabled={chat.isLoading}
                  className="w-full text-left text-[10px] text-gray-500 hover:text-[#DB5F5B] hover:bg-[#F5F6E5]/50 rounded px-2 py-1.5 transition-colors border border-transparent hover:border-[#DB5F5B]/10 disabled:opacity-50"
                >
                  • {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )}
