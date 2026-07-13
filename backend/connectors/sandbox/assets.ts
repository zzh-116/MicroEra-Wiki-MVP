// Sandbox Assets — paginated listing with loop-to-completion.
// Supports filtering by projectId, type, status, keyword, and since (incremental).

import { getAssets } from './client.js';
import type { SandboxAsset, SandboxPageRequest } from './types.js';
import type { ListParams } from '../types.js';

const DEFAULT_PAGE_SIZE = 50;

export interface AssetListResult {
  assets: SandboxAsset[];
  total: number;
  pages: number;
}

export async function listAllAssets(params: ListParams = {}): Promise<AssetListResult> {
  const all: SandboxAsset[] = [];
  let pageNum = 1;
  let total = 0;

  while (true) {
    const request: SandboxPageRequest = {
      pageNum,
      pageSize: DEFAULT_PAGE_SIZE,
      projectId: params.projectId,
      types: params.type,
      statuses: params.status,
      name: params.keyword,
      authorIds: params.author,
    };

    const page = await getAssets(request);

    if (pageNum === 1) {
      total = page.total;
      console.log(`[Sandbox:Assets] Total: ${total}, pageSize: ${DEFAULT_PAGE_SIZE}, pages: ~${Math.ceil(total / DEFAULT_PAGE_SIZE)}`);
    }

    all.push(...page.rows);

    // Apply client-side since filter if provided
    const filtered = params.since
      ? all.filter((a) => !a.updateTime || a.updateTime >= params.since!)
      : all;

    console.log(`[Sandbox:Assets] Page ${pageNum}: got ${page.rows.length}, total collected: ${all.length}/${total}`);

    // Stop when we've collected all rows
    if (all.length >= total || page.rows.length === 0) {
      return {
        assets: params.since ? filtered : all,
        total: params.since ? filtered.length : total,
        pages: pageNum,
      };
    }

    pageNum++;
  }
}
