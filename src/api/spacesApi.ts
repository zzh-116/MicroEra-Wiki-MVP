import { WikiSpace } from '../types/wiki';
import { get } from './client';
import { mvpCategoryToSpace, toStrId } from '../utils/adapter';

export const spacesApi = {
  async getSpaces(): Promise<WikiSpace[]> {
    try {
      const data: any[] = await get('/categories');
      // Convert flat categories to a simple tree structure
      const spaces: WikiSpace[] = data.map((c) =>
        mvpCategoryToSpace(c),
      ) as unknown as WikiSpace[];

      // Build a simple tree: group under a root node
      const root: WikiSpace = {
        id: 'root',
        name: '微观纪元 Wiki',
        description: '企业知识门户',
        visibility: 'internal',
        children: spaces,
      };

      return [root];
    } catch {
      return [];
    }
  },
};
