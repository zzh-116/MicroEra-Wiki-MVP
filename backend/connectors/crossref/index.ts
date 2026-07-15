// 修复 crossref/index.ts
import { Connector, Document, DocumentSummary, SyncResult } from "../types.js";
import { ConnectorRegistry } from "../registry.js";

class CrossRefConnector implements Connector {
  readonly name = "crossref";
  readonly label = "CrossRef";
  readonly version = "1.0";
  async connect() {}
  async list() { return []; }
  async detail(id: string): Promise<Document> {
    throw new Error("not implemented: " + id);
  }
  async sync() { return { connector: this.name, total: 0, created: 0, updated: 0, skipped: 0, errors: [], startedAt: "", finishedAt: "", durationMs: 0 }; }
}
ConnectorRegistry.register("crossref", () => new CrossRefConnector());
