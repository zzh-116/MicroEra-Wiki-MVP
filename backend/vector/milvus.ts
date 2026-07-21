import { config } from '../config.js';

// @ts-ignore — @zilliz/milvus2-sdk-node is optional, install with: npm install @zilliz/milvus2-sdk-node
let MilvusClientClass: any = null;

async function loadSDK(): Promise<boolean> {
  if (MilvusClientClass) return true;
  try {
    const mod = await import('@zilliz/milvus2-sdk-node');
    MilvusClientClass = mod.MilvusClient;
    return true;
  } catch {
    console.warn('[Milvus] SDK not installed. Run: npm install @zilliz/milvus2-sdk-node');
    return false;
  }
}

interface VectorRecord {
  chunk_id: string;
  entry_id: number;
  embedding: number[];
}

interface SearchResult {
  entry_id: number;
  chunk_id: string;
  score: number;
}

const SCHEMA_VERSION = 2; // bump when schema changes

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

    if (hasCollection.value) {
      // Check if schema is v2 (has chunk_id field)
      try {
        const desc = await this.client.describeCollection({ collection_name: collName });
        const hasChunkId = desc.schema?.fields?.some((f: any) => f.name === 'chunk_id');
        if (!hasChunkId) {
          console.warn('[Milvus] Old schema detected (no chunk_id), dropping and recreating...');
          await this.client.dropCollection({ collection_name: collName });
          await this.createCollectionV2(collName);
        }
      } catch {
        // If we can't check, recreate
        await this.client.dropCollection({ collection_name: collName });
        await this.createCollectionV2(collName);
      }
    } else {
      await this.createCollectionV2(collName);
    }

    await this.client.loadCollection({ collection_name: collName });
  }

  private async createCollectionV2(collName: string): Promise<void> {
    await this.client.createCollection({
      collection_name: collName,
      fields: [
        { name: 'id', data_type: 'Int64', is_primary_key: true, autoID: true },
        { name: 'chunk_id', data_type: 'VarChar', max_length: 128 },
        { name: 'entry_id', data_type: 'Int64' },
        {
          name: 'embedding',
          data_type: 'FloatVector',
          dim: config.milvus.dimension,
        },
      ],
    });
    console.log(`[Milvus] Created collection v2: ${collName}`);

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

  async insert(records: VectorRecord[]): Promise<void> {
    if (!this.ready || !this.client || records.length === 0) return;

    const validRecords = records.filter((r) => r.embedding.length > 0);
    if (validRecords.length === 0) return;

    await this.client.insert({
      collection_name: config.milvus.collection,
      data: validRecords.map((r) => ({
        chunk_id: r.chunk_id,
        entry_id: r.entry_id,
        embedding: r.embedding,
      })),
    });
    console.log(`[Milvus] Inserted ${validRecords.length} vectors (chunks)`);
  }

  async search(queryVector: number[], topK = 10): Promise<SearchResult[]> {
    if (!this.ready || !this.client) return [];

    try {
      const result = await this.client.search({
        collection_name: config.milvus.collection,
        vector: queryVector,
        limit: topK,
        output_fields: ['entry_id', 'chunk_id'],
      });

      return (result.results || []).map((r: any) => ({
        entry_id: r.entry_id,
        chunk_id: r.chunk_id || `entry_${r.entry_id}_chunk_0`,
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
