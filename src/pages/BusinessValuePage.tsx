import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Briefcase, TrendingUp, DollarSign, Cpu, ArrowRight, ShieldAlert, Award } from 'lucide-react';
import { BusinessMetric } from '../types/wiki';
import { mockBusinessMetrics } from '../mock/mockData';
import Unauthorized from '../components/Unauthorized';

interface BusinessValuePageProps {
  onNavigate: (view: string, id?: string) => void}

export default function BusinessValuePage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [metrics, setMetrics] = useState<BusinessMetric[]>([]);

  useEffect(() => {
    setMetrics(mockBusinessMetrics)}, []);

  if (!isLoggedIn) {
    return (
      <Unauthorized requiredRole="internal"
      />
    )}

  return (
    <div className="space-y-5" id="business-value-page-panel">
      {/* Title Header */}
      <div className="space-y-1 select-none">
        <h2 className="text-base font-extrabold text-[#2B3150] flex items-center space-x-1.5 uppercase tracking-wide">
          <Briefcase className="w-5 h-5 text-[#DB5F5B]" />
          <span>科研计算与仿真成果商业价值审计中心 (Commercial ROI Metrics)</span>
        </h2>
        <p className="text-[10px] text-gray-400">
          量化展示微观纪元 Sandbox 数字孪生计算在替代传统高成本物理实验中所节省的实际资金开销及商业转化红利。
        </p>
      </div>

      {/* Highlights Metrics Dashboard Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 select-none">
        <div className="bg-[#2B3150] text-white p-4 rounded-xl border border-[#DB5F5B]/20 shadow-sm relative overflow-hidden">
          <div className="absolute right-2 bottom-2 text-white/5">
            <DollarSign className="w-20 h-20" />
          </div>
          <span className="text-[10px] text-[#F2D760] font-bold block uppercase tracking-wider">总计节省算力开销</span>
          <span className="text-2xl font-extrabold text-white block tracking-tight font-sans mt-1">
            ¥12,450,000
          </span>
          <p className="text-[10px] text-gray-300 leading-normal mt-1.5">
            通过高阶自适应纠错仿真，成功减少 35% 物理实验返工和流片测点开销。
          </p>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-[#DB5F5B] font-bold block uppercase tracking-wider">技术转化转化专利</span>
            <span className="text-xl font-extrabold text-gray-800 block tracking-tight mt-1">
              4 项国家级专利申报
            </span>
            <p className="text-[10px] text-gray-500 leading-normal mt-1.5">
              稳定子算法优化结果已被列入 2026 年第 3 季度平台组量子防护体系申报计划。
            </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-green-700 font-bold block uppercase tracking-wider">物理计算时间缩短</span>
            <span className="text-xl font-extrabold text-gray-800 block tracking-tight mt-1">
              约缩短 320% 计算耗时
            </span>
            <p className="text-[10px] text-gray-500 leading-normal mt-1.5">
              对比传统物理退火计算扫描，通过在 Sandbox 中运行，实现了算法成果分钟级产出。
            </p>
          </div>
        </div>
      </div>

      {/* Metrics list */}
      <div className="space-y-3">
        <div className="flex items-center space-x-1.5 pb-1 border-b border-gray-100 text-xs font-bold text-gray-700">
          <TrendingUp className="w-4 h-4 text-[#DB5F5B]" />
          <span>细分项目商业价值度量审计列表 (ROI Details)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.map((metric) => (
            <div
              key={metric.id}
              className="bg-white border border-gray-200 hover:border-[#DB5F5B]/30 hover:shadow-sm transition-all p-4 rounded-xl flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between select-none">
                  <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-100">
                    商业审计
                  </span>
                  
                  <span className="text-xs font-bold text-gray-400 font-mono">
                    编号: {metric.id}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-1">
                  <h3 className="font-extrabold text-xs text-gray-800 tracking-tight leading-normal">
                    {metric.metricName}
                  </h3>
                  
                  <span className="text-sm font-extrabold text-[#DB5F5B] shrink-0 font-sans">
                    {metric.metricValue}
                  </span>
                </div>

                <p className="text-[11px] text-gray-500 leading-relaxed bg-gray-50 p-2 rounded">
                  审计核对口径与依据：{metric.source}
                </p>
              </div>

              {/* Action row link */}
              <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 text-[10px]">
                <span className="text-gray-400">核对状态：✅ 外部财务与算法组联合认定通过</span>
                
                <button
                  onClick={() => navigate(`/entry/${metric.projectEntryId}`)}
                  className="text-[#DB5F5B] font-bold hover:underline flex items-center select-none"
                >
                  <span>直达归档项目 Wiki</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )}
