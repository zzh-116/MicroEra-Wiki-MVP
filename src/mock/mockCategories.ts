import { Category } from '../types/category';

export const mockCategories: Category[] = [
  { id: 1, name: '展示素材', description: '公司业务流程图、效果图、概念分析图等常用汇报素材', sort_order: 1 },
  { id: 2, name: '产品资料', description: '公司主营业务、产品体系、解决方案与垂直应用方向', sort_order: 2 },
  { id: 3, name: '技术能力', description: '核心技术优势、实验平台、算法能力与科研工作流描述', sort_order: 3 },
  { id: 4, name: '专利成果', description: '已授权/申请中的专利、软件著作权、科研论文等学术成果', sort_order: 4 },
  { id: 5, name: '数据条目', description: '研发团队协作对齐的数据、Schema 架构、数据定义信息', sort_order: 5 },
  { id: 6, name: '研发协作', description: '跨组日常研发、流程与基础接口调用说明', sort_order: 6 }
];
