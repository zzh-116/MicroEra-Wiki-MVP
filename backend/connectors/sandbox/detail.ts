// Sandbox Detail — fetch full detail for an asset based on its type.
// Routes to the correct API endpoint: operator, dot, dataset, or post.

import { getDetail } from './client.js';
import type { SandboxAsset, SandboxDetail } from './types.js';

export async function fetchDetail(asset: SandboxAsset): Promise<SandboxDetail> {
  return getDetail(asset.type, asset.id);
}
