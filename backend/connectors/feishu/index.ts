// 修复 feishu/index.ts
import { Connector, Document, DocumentSummary, SyncResult } from "../types.js";
import { ConnectorRegistry } from "../registry.js";
import { config } from "../../config.js";

class FeishuConnector implements Connector {
  readonly name = "feishu";
  readonly label = "飞书文档";
  readonly version = "1.0";
  async connect() {}
  async list(): Promise<DocumentSummary[]> {
    if (!config.feishu?.wikiSpaceId) throw new Error("FEISHU_WIKI_SPACE_ID not configured");
    return [];
  }
  async detail(id: string): Promise<Document> {
    throw new Error("not implemented: " + id);
  }
  async sync() { return { connector: this.name, total: 0, created: 0, updated: 0, skipped: 0, errors: [], startedAt: "", finishedAt: "", durationMs: 0 }; }
}
ConnectorRegistry.register("feishu", () => new FeishuConnector());
