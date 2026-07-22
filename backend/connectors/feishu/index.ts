import { Connector, Document, DocumentSummary, SyncResult } from "../types.js";
import { ConnectorRegistry } from "../registry.js";
import { config } from "../../config.js";
import { listWikiPages, getDocumentContent, listSpaces } from "./client.js";
import { getToken } from "./auth.js";

class FeishuConnector implements Connector {
  readonly name = "feishu";
  readonly label = "飞书文档";
  readonly version = "1.0";

  async connect(): Promise<void> {
    if (!config.feishu.appId || !config.feishu.appSecret) {
      throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET must be configured");
    }
    if (!config.feishu.wikiSpaceId) {
      throw new Error("FEISHU_WIKI_SPACE_ID must be configured");
    }
    // Actually validate credentials by getting a token
    await getToken(config.feishu.appId, config.feishu.appSecret);
  }

  async list(): Promise<DocumentSummary[]> {
    if (!config.feishu.wikiSpaceId) {
      throw new Error("FEISHU_WIKI_SPACE_ID not configured");
    }

    const pages = await listWikiPages(config.feishu.wikiSpaceId);

    return pages.map((page) => ({
      id: page.pageToken,
      title: page.title,
      type: "feishu_doc",
      updatedAt: page.updatedAt,
      description: undefined,
      metadata: { source: "feishu", spaceId: config.feishu.wikiSpaceId },
    }));
  }

  async detail(id: string): Promise<Document> {
    const pages = await listWikiPages(config.feishu.wikiSpaceId!);
    const page = pages.find((p) => p.pageToken === id);

    if (!page) {
      throw new Error(`Feishu page not found: ${id}`);
    }

    const content = await getDocumentContent(id);

    return {
      id: page.pageToken,
      title: page.title,
      type: "feishu_doc",
      updatedAt: page.updatedAt,
      content, // Markdown content from Feishu
      attachments: [],
      source: "feishu",
      tags: [],
      author: undefined,
      metadata: { source: "feishu", spaceId: config.feishu.wikiSpaceId },
    };
  }

  async sync(): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    try {
      const pages = await this.list();
      const total = pages.length;

      for (const page of pages) {
        try {
          const doc = await this.detail(page.id);
          // Import document through the pipeline (chunk → embed → vector)
          // Import is handled by the sync route in server/routes/connectors.ts
          created++; // Would be more nuanced in a real incremental sync
        } catch (err: any) {
          errors.push(`${page.title}: ${err.message}`);
          skipped++;
        }
      }

      return {
        connector: this.name,
        total,
        created,
        updated,
        skipped,
        errors,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
      };
    } catch (err: any) {
      return {
        connector: this.name,
        total: 0,
        created,
        updated,
        skipped,
        errors: [err.message],
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
      };
    }
  }
}

ConnectorRegistry.register("feishu", () => new FeishuConnector());
