export type SavedQuery = {
  id: string;
  title: string;
  description: string | null;
  environment: string;
  query: string;
  createdAt: string;
  updatedAt: string;
};

export type HistoryEntry = {
  id: string;
  environment: string;
  query: string;
  durationMs: number | null;
  rowCount: number | null;
  success: boolean;
  error: string | null;
  timestamp: string;
};

export type QueryResult = {
  environment: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
};

export type EnvironmentCatalog = {
  environments: string[];
  confirmEnvironments: string[];
  maxRows: number;
};
