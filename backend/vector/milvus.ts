import { config } from '../config.js';

// @ts-ignore — @zilliz/milvus2-sdk-node is optional, install with: npm install @zilliz/milvus2-sdk-node
// eslint-disable-next-line
let MilvusClientClass: any = null;

async function loadSDK(): Promise<boolean> {
  if (MilvusClientClass) return true;
  try {
    // @ts-ignore — optional dependency
    const mod = await import('@zilliz/milvus2-sdk-node');
    MilvusClientClass = mod.MilvusClient;
    return true;
  } catch {
    console.warn('[Milvus] SDK not installed. Run: npm install @zilliz/milvus2-sdk-node');
    return false;
  }
}

interface VectorRecord {
  entry_id: number;
  embedding: number[];
}

interface SearchResult {
  entry_id: number;
  score: number;
}

export class MilvusClient {
  private client: any = null;
  private ready = false;

  async connect(): Promise<void> {
    try {
      const ok = await loadSDK();
      if (!ok) return;

      this.client = new MilvusClientClass({
        address: `${config.milvus.host}:${config.milvus.port}`,
      });

      // Check connection
      await this.client.checkHealth();
      console.log(`[Milvus] Connected to ${config.milvus.host}:${config.milvus.port}`);

      await this.ensureCollection();
      this.ready = true;
    } catch (err: any) {
      console.warn(`[Milvus] Connection failed: ${err.message}. Vector search will be unavailable.`);
      this.ready = false;
    }
  }

  private async ensureCollection(): Promise<void> {
    if (!this.client) return;

    const collName = config.milvus.collection;
    const hasCollection = await this.client.hasCollection({ collection_name: collName });

    if (!hasCollection.value) {
      await this.client.createCollection({
        collection_name: collName,
        fields: [
          { name: 'id', data_type: 'Int64', is_primary_key: true, autoID: true },
          { name: 'entry_id', data_type: 'Int64' },
          {
            name: 'embedding',
            data_type: 'FloatVector',
            dim: config.milvus.dimension,
          },
        ],
      });
      console.log(`[Milvus] Created collection: ${collName}`);
    }

    // Ensure index
    const hasIndex = await this.client.hasIndex({ collection_name: collName });
    if (!hasIndex.value) {
      await this.client.createIndex({
        collection_name: collName,
        field_name: 'embedding',
        index_name: 'embedding_idx',
        index_type: 'IVF_FLAT',
        metric_type: 'COSINE',
        params: { nlist: 128 },
      });
      console.log(`[Milvus] Created index on ${collName}.embedding`);
    }

    await this.client.loadCollection({ collection_name: collName });
  }

  async insert(records: VectorRecord[]): Promise<void> {
    if (!this.ready || !this.client || records.length === 0) return;

    const validRecords = records.filter((r) => r.embedding.length > 0);
    if (validRecords.length === 0) return;

    await this.client.insert({
      collection_name: config.milvus.collection,
      data: validRecords.map((r) => ({
        entry_id: r.entry_id,
        embedding: r.embedding,
      })),
    });
    console.log(`[Milvus] Inserted ${validRecords.length} vectors`);
  }

  async search(queryVector: number[], topK = 10): Promise<SearchResult[]> {
    if (!this.ready || !this.client) return [];

    try {
      const result = await this.client.search({
        collection_name: config.milvus.collection,
        vector: queryVector,
        limit: topK,
        output_fields: ['entry_id'],
      });

      return (result.results || []).map((r: any) => ({
        entry_id: r.entry_id,
        score: r.score || 0,
      }));
    } catch (err: any) {
      console.warn(`[Milvus] Search failed: ${err.message}`);
      return [];
    }
  }

  isReady(): boolean {
    return this.ready;
  }
}

export const milvusClient = new MilvusClient();
