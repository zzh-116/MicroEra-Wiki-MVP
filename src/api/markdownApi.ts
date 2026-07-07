import { MarkdownFile } from '../types/wiki';
import { mockMarkdownFiles } from '../mock/mockData';

export const markdownApi = {
  async getMarkdownBySourceFileId(sourceFileId: string): Promise<MarkdownFile | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const md = mockMarkdownFiles.find(m => m.sourceFileId === sourceFileId);
        resolve(md || null);
      }, 200);
    });
  },

  async triggerMarkItDown(sourceFileId: string): Promise<MarkdownFile> {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Find existing or create a dummy converted file
        const existing = mockMarkdownFiles.find(m => m.sourceFileId === sourceFileId);
        if (existing) {
          resolve(existing);
          return;
        }

        const newMd: MarkdownFile = {
          id: `md-auto-${Date.now()}`,
          sourceFileId,
          mdFilename: `converted_${Date.now()}.md`,
          mdStoragePath: `/nas/converted/converted_${Date.now()}.md`,
          markdownContent: `# 自动转换结果文档\n\n该文档由 **MarkItDown v0.3.1** 自动识别，提取源文件的 LaTeX 数学公式以及核心结构。\n\n- **解析状态**: 成功\n- **转换时刻**: ${new Date().toISOString()}\n\n*请及时对内容进行关联校核。*`,
          parserName: 'MarkItDown',
          parserVersion: 'v0.3.1',
          parseStatus: 'success',
          createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };

        mockMarkdownFiles.push(newMd);
        resolve(newMd);
      }, 1000);
    });
  }
};
