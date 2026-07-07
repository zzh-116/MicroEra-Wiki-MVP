import { useState } from 'react';
import { Settings, Play, CheckCircle2, ChevronRight, CornerDownRight, Terminal } from 'lucide-react';
import { ServiceCard } from '../types/wiki';
import { servicesApi } from '../api/servicesApi';

interface ServiceCardsProps {
  services: ServiceCard[];
}

export default function ServiceCards({ services }: ServiceCardsProps) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [payloads, setPayloads] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { elapsedMs: number; response: any }>>({});

  const handlePayloadChange = (serviceId: string, value: string) => {
    setPayloads(prev => ({ ...prev, [serviceId]: value }));
  };

  const handleRun = async (service: ServiceCard) => {
    setRunningId(service.id);
    const rawPayload = payloads[service.id] || service.inputSchema;
    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(rawPayload);
    } catch {
      parsedPayload = { raw_text: rawPayload };
    }

    try {
      const res = await servicesApi.invokeServiceMock(service.id, parsedPayload);
      setResults(prev => ({
        ...prev,
        [service.id]: {
          elapsedMs: res.elapsedMs,
          response: res.response
        }
      }));
    } catch (err: any) {
      setResults(prev => ({
        ...prev,
        [service.id]: {
          elapsedMs: 0,
          response: { error: err.message || 'Simulation error' }
        }
      }));
    } finally {
      setRunningId(null);
    }
  };

  if (!services || services.length === 0) return null;

  return (
    <div className="space-y-4" id="service-cards-container">
      {services.map((service) => {
        const isRunning = runningId === service.id;
        const result = results[service.id];
        const statusLabel = 
          service.status === 'demo' ? '可演示 (Demo)' : 
          service.status === 'connected' ? '已接入 (Connected)' : '规划中 (Planning)';
        
        const statusColor = 
          service.status === 'demo' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 
          service.status === 'connected' ? 'bg-green-50 text-green-700 border-green-200' : 
          'bg-gray-50 text-gray-400 border-gray-200';

        return (
          <div
            key={service.id}
            className="bg-white border border-gray-150 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-[#DB5F5B]/30 transition-all text-xs"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div className="pr-2">
                <div className="flex items-center space-x-1.5 mb-1">
                  <span className="bg-[#2B3150] p-1 rounded">
                    <Settings className="w-3.5 h-3.5 text-white" />
                  </span>
                  <span className="font-semibold text-gray-800 tracking-tight">
                    {service.name}
                  </span>
                </div>
                <p className="text-gray-500 text-[11px] leading-normal">{service.description}</p>
              </div>

              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${statusColor}`}>
                {statusLabel}
              </span>
            </div>

            {/* Endpoints & details */}
            <div className="space-y-1 mb-2.5 font-mono text-[10px] text-gray-500 bg-gray-50 p-2 rounded border border-gray-100">
              <div className="flex items-center">
                <span className="font-bold text-gray-600 mr-1.5 w-16">调用方式:</span>
                <span className="bg-white border border-gray-200 px-1 rounded text-red-600">POST</span>
              </div>
              <div className="flex items-center truncate">
                <span className="font-bold text-gray-600 mr-1.5 w-16">服务路由:</span>
                <span className="text-blue-600 font-bold truncate" title={service.mockEndpoint}>{service.mockEndpoint}</span>
              </div>
            </div>

            {/* Config Sandbox */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                  输入载荷参数 (Payload Schema/JSON)：
                </label>
                <textarea
                  className="w-full h-14 bg-gray-900 text-green-400 p-2 rounded-md font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-[#DB5F5B]"
                  value={payloads[service.id] !== undefined ? payloads[service.id] : service.inputSchema}
                  onChange={(e) => handlePayloadChange(service.id, e.target.value)}
                  placeholder="请输入参数JSON..."
                  id={`service-payload-${service.id}`}
                />
              </div>

              {/* Trigger */}
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-gray-400">
                  预期输出：{service.serviceType.toUpperCase()} 标准协议回包
                </span>
                
                <button
                  onClick={() => handleRun(service)}
                  disabled={isRunning}
                  className="px-2.5 py-1.5 bg-[#2B3150] hover:bg-[#2B3150]/90 text-white font-bold rounded transition-all flex items-center space-x-1 text-[10px]"
                >
                  {isRunning ? (
                    <>
                      <span className="animate-spin mr-1 h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                      <span>正在调用...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 text-[#F2D760]" />
                      <span>沙箱调用测试</span>
                    </>
                  )}
                </button>
              </div>

              {/* Response output */}
              {result && (
                <div className="mt-2.5 bg-[#F5F6E5]/40 border border-[#DB5F5B]/10 rounded-md p-2 text-[10px]">
                  <div className="flex items-center justify-between text-gray-500 font-semibold mb-1 border-b border-[#DB5F5B]/10 pb-1 font-mono">
                    <span className="flex items-center text-[#2B3150]">
                      <Terminal className="w-3 h-3 mr-1 text-[#DB5F5B]" />
                      <span>API RESPONSE OUTPUT</span>
                    </span>
                    <span className="text-green-600">
                      SUCCESS • {result.elapsedMs}ms
                    </span>
                  </div>
                  <pre className="text-[9px] font-mono text-gray-600 break-all bg-white p-2 rounded border border-gray-150 overflow-x-auto max-h-36">
                    <code>{JSON.stringify(result.response, null, 2)}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
