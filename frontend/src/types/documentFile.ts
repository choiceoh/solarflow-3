export interface DocumentFile {
  file_id: string;
  entity_type: string;
  entity_id: string;
  file_type: string;
  original_name: string;
  content_type?: string;
  size_bytes: number;
  uploaded_by?: string;
  created_at: string;
}
