import { ServiceCard } from '../types/wiki';
import { mockServiceCards } from '../mock/mockData';

export const servicesApi = {
  async getServicesByEntryId(entryId: string): Promise<ServiceCard[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockServiceCards.filter(s => s.entryId === entryId));
      }, 200);
    });
  },

  async invokeServiceMock(
    serviceId: string,
    payload: Record<string, any>
  ): Promise<{ status: string; elapsedMs: number; response: any }> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const service = mockServiceCards.find(s => s.id === serviceId);
        if (!service) {
          reject(new Error('未找到该可调用服务'));
          return;
        }

        const start = Date.now();

        if (service.serviceType === 'rag') {
          // RAG service
          const q = payload.query || '稳定子算法阈值';
          resolve({
            status: 'success',
            elapsedMs: Date.now() - start + 450,
            response: {
              answer: `[RAG 语义检索响应] 根据检索库中第 e-stabilizer-project 条目及 《Quantum Error Correction with Stabilizer Codes》 Gottesman (1997) 论文内容：\n\n您询问的 “${q}” 对应纠错零错保真度阈值。在超导 7 比特距离为 3 模拟下，物理泡利错误阈值约为 1.52%。在这一界限下，逻辑差错率随码距呈现幂律收敛。`,
              metadata: {
                chunks_read: 3,
                tokens_processed: 1240,
                model: 'Gemini 2.5 Flash / embedding-001'
              }
            }
          });
        } else if (service.serviceType === 'mcp') {
          // MCP Simulator Tool
          const runs = Number(payload.runs || payload.simulator_params?.runs || 10000);
          const errorRate = Number(payload.error_rate || payload.simulator_params?.error_rate || 0.01);
          const d = Number(payload.d || payload.simulator_params?.d || 3);

          // Calculate a realistic-looking fidelity
          // If error rate is low, fidelity is high. If error rate is above 0.015, fidelity drops quickly
          const factor = Math.max(0, 0.015 - errorRate);
          const randomNoise = (Math.random() - 0.5) * 0.002;
          const logicalFidelity = errorRate < 0.0152 
            ? Math.min(0.9999, 1.0 - (errorRate * errorRate * (d - 1)) + randomNoise)
            : Math.max(0.5, 0.95 - (errorRate - 0.0152) * 5 + randomNoise);

          resolve({
            status: 'success',
            elapsedMs: Date.now() - start + 800,
            response: {
              status: 'success',
              execution_id: `mcp-run-${Math.floor(Math.random() * 900000 + 100000)}`,
              simulation_result: {
                code_distance: d,
                monte_carlo_runs: runs,
                input_pauli_error_rate: errorRate,
                simulated_logical_fidelity: Number(logicalFidelity.toFixed(5)),
                simulated_logical_error_rate: Number((1 - logicalFidelity).toFixed(5)),
                verdict: errorRate < 0.0152 ? 'Below error threshold, error correction is beneficial.' : 'Above threshold, raw physical error outperforms correction.'
              }
            }
          });
        } else if (service.serviceType === 'miqi') {
          // MiQi Action Call
          const sessionId = payload.session_id || 'MQ-SESS-DEFAULT';
          resolve({
            status: 'success',
            elapsedMs: Date.now() - start + 600,
            response: {
              miqi_action_status: 'completed',
              linked_session_id: sessionId,
              findings: [
                '在 Sandbox-ID: SB-8849-QC 下，已顺利关联计算流与 Gottesman 论文节点。',
                '系统自动为该计算任务提取了 320% ROI 的商业价值摘要，并将 schema 登记于元数据字典。'
              ],
              recommendation: '建议在下一步仿真中，将物理缺陷率降低至 1.0% (0.01) 进行稳定状态核验。'
            }
          });
        } else {
          resolve({
            status: 'success',
            elapsedMs: Date.now() - start + 100,
            response: { message: '默认 Mock 调用成功' }
          });
        }
      }, 500);
    });
  }
};
