import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { queryApi, AIResponse } from '../api/queryApi';
import { entriesApi } from '../api/entriesApi';
import { WikiEntry } from '../types/wiki';
import { mockGraphNodes, mockGraphEdges } from '../mock/mockData';
import AIAnswerPanel from '../components/AIAnswerPanel';
import KnowledgeGraph from '../components/KnowledgeGraph';
import RelatedKnowledge from '../components/RelatedKnowledge';
import { Sparkles, Send, HelpCircle, CornerDownRight, BookOpen } from 'lucide-react';

interface AIQueryPageProps {
  onNavigate: (view: string, id?: string) => void;
}

export default function AIQueryPage({ onNavigate }: AIQueryPageProps) {
  const { isLoggedIn } = useAuth();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string>('');
  const [references, setReferences] = useState<any[]>([]);
  const [relatedEntries, setRelatedEntries] = useState<WikiEntry[]>([]);

  const handleAsk = async (q: string) => {
    if (!q.trim()) return;
    setQuestion(q);
    setLoading(true);
    setAnswer('');
    setReferences([]);
    setRelatedEntries([]);

    try {
      const res = await queryApi.askAI(q);
      setAnswer(res.answer);
      setReferences(res.references);

      // Load related entry models
      if (res.relatedEntryIds.length > 0) {
        const all = await entriesApi.getEntries();
        const filtered = all.filter(e => res.relatedEntryIds.includes(e.id));
        setRelatedEntries(filtered);
      }
    } catch (err) {
      console.error('Error during AI query:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAsk(question);
  };

  const handleQuickQuestionClick = (q: string) => {
    setQuestion(q);
    handleAsk(q);
  };

  // Check if a quick question was routed from another page
  useEffect(() => {
    const quickQ = localStorage.getItem('miqro_wiki_quick_q');
    if (quickQ) {
      localStorage.removeItem('miqro_wiki_quick_q');
      setQuestion(quickQ);
      handleAsk(quickQ);
    }
  }, []);

  return (
    <div className="space-y-5" id="ai-query-page-panel">
      {/* Title Header */}
      <div className="space-y-1">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1 uppercase tracking-wide">
          <Sparkles className="w-5 h-5 text-[#DB5F5B] animate-pulse" />
          <span>MiQi 智能科研 RAG 问答中枢 (Neural Semantic Grounding)</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          基于高维物理沙箱（Sandbox）输出、MarkItDown 文档缓存及向量 Embedding 库为您提供无幻觉的溯源级解答。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Ask & Response section */}
        <div className="lg:col-span-8 space-y-4">
          {/* Ask Input form */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <form onSubmit={handleFormSubmit} className="space-y-3">
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wide">
                请输入您的技术问题或自然语言查询：
              </label>
              
              <div className="relative">
                <input
                  type="text"
                  required
                  className="w-full pl-4 pr-12 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#DB5F5B]/30 focus:border-[#DB5F5B] text-xs font-sans transition-all shadow-inner"
                  placeholder="请输入您的技术疑问，例如：零错阈值实验结果是多少？..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  id="ai-query-input"
                />
                
                <button
                  type="submit"
                  disabled={loading}
                  className="absolute right-2 top-1.5 p-1.5 bg-[#DB5F5B] hover:bg-[#DB5F5B]/90 text-white rounded-md transition-all flex items-center justify-center shrink-0"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </form>

            {/* Quick Suggestions list */}
            <div className="mt-3 text-[10px] text-gray-400 select-none">
              <span className="font-bold block mb-1">建议提问模板：</span>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
                {[
                  '什么是稳定子算法？它是如何进行纠错的？',
                  '稳定子算法 Sandbox 计算项目 (SB-8849-QC) 取得了哪些关键计算结果？',
                  '该量子纠错项目的商业转化价值与算力开销节省是多少？'
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleQuickQuestionClick(q)}
                    className="bg-gray-50 hover:bg-[#F5F6E5] text-gray-600 border border-gray-150 rounded px-2 py-1 text-left hover:text-[#DB5F5B] hover:border-[#DB5F5B]/30 transition-all truncate"
                    title={q}
                  >
                    • {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* AI Response Panel */}
          <AIAnswerPanel
            question={question}
            answer={answer}
            references={references}
            onNavigate={onNavigate}
            isLoading={loading}
          />
        </div>

        {/* Right contextual info & small graph */}
        <div className="lg:col-span-4 space-y-4">
          {/* Small Graph view */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <h3 className="font-extrabold text-xs text-gray-800 pb-1.5 border-b border-gray-100 mb-2 uppercase tracking-wide">
              检索相关的知识节点网络
            </h3>
            <KnowledgeGraph
              nodes={mockGraphNodes.slice(0, 5)}
              edges={mockGraphEdges.slice(0, 4)}
              onNavigate={onNavigate}
              height={190}
              interactive={false}
            />
          </div>

          {/* Related Entries */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <h3 className="font-extrabold text-xs text-gray-800 pb-1.5 border-b border-gray-100 mb-2 uppercase tracking-wide">
              关联成果物穿透 (Direct Assets)
            </h3>
            <RelatedKnowledge
              relatedEntries={relatedEntries}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
