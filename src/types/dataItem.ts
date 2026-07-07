export interface DataItem {
  id: number;
  entry_id: number; // Links back to general entry
  data_name: string;
  data_definition: string;
  data_format: string; // csv, json, sql, cif, excel, txt etc
  storage_description?: string;
  schema_description?: string;
  schema_version: string;
  responsible_person: string;
  updated_at: string;
}
