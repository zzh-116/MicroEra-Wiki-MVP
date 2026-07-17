import type { MarkdownFile } from '../types/wiki';

export const markdownApi = {
  async getMarkdownBySourceFileId(sourceFileId: string): Promise<MarkdownFile | null> {
    // TODO: Backend MarkItDown conversion endpoint not yet implemented.
    // Document parsing is handled by the Pipeline import flow (parse → chunk → embed).
    return null;
  },

  async triggerMarkItDown(_sourceFileId: string): Promise<MarkdownFile> {
    throw new Error('MarkItDown 实时转换暂未开放，请通过 Pipeline 导入功能处理文档。');
  },
};
