import { WikiFile } from '../types/file';

export const mockFiles: WikiFile[] = [
  {
    id: 1,
    entry_id: 4,
    original_filename: 'mock-business-flow.png',
    stored_filename: 'uuid_mock-business-flow.png',
    file_type: 'image/png',
    file_size: 1542300, // ~1.47 MB
    storage_path: '/uploads/images/uuid_mock-business-flow.png',
    usage_type: 'PPT素材',
    created_at: '2026-06-04T14:00:00Z',
  },
  {
    id: 2,
    entry_id: 5,
    original_filename: 'mock-product-image.png',
    stored_filename: 'uuid_mock-product-image.png',
    file_type: 'image/png',
    file_size: 2840500, // ~2.71 MB
    storage_path: '/uploads/images/uuid_mock-product-image.png',
    usage_type: '宣发素材',
    created_at: '2026-06-05T15:00:00Z',
  },
  {
    id: 3,
    entry_id: 6,
    original_filename: 'mock-factory-photo.png',
    stored_filename: 'uuid_mock-factory-photo.png',
    file_type: 'image/png',
    file_size: 4120900, // ~3.93 MB
    storage_path: '/uploads/images/uuid_mock-factory-photo.png',
    usage_type: '宣发素材',
    created_at: '2026-06-06T16:00:00Z',
  }
];
