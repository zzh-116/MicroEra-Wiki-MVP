import { EntryType } from '../types/entry';

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  asset: '展示素材',
  product: '产品业务',
  tech: '技术能力',
  patent: '专利成果',
  data_item: '数据条目'
};

export const ENTRY_TYPE_COLORS: Record<EntryType, string> = {
  asset: 'bg-indigo-50 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30',
  product: 'bg-sky-50 text-sky-700 border-sky-200/60 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/30',
  tech: 'bg-purple-50 text-purple-700 border-purple-200/60 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30',
  patent: 'bg-teal-50 text-teal-700 border-teal-200/60 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900/30',
  data_item: 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30'
};
