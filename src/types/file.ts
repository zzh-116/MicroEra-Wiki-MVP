export type UsageType = 'PPT素材' | '宣发素材' | '客户展示' | '研发资料' | '产品资料' | '内部归档';

export interface WikiFile {
  id: number;
  entry_id: number;
  original_filename: string;
  stored_filename: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  usage_type: UsageType;
  created_at: string;
}
