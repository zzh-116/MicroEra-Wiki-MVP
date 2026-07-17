import type { ServiceCard } from '../types/wiki';

export const servicesApi = {
  async getServicesByEntryId(_entryId: string): Promise<ServiceCard[]> {
    // TODO: Backend service registry not yet implemented.
    // RAG, MCP, and MiQi services are currently documented in the entry detail UI
    // but invocation endpoints are not yet wired to real compute backends.
    return [];
  },

  async invokeServiceMock(
    _serviceId: string,
    _payload: Record<string, unknown>,
  ): Promise<{ status: string; elapsedMs: number; response: unknown }> {
    throw new Error('服务调用暂未开放。');
  },
};
