export interface ExcelData {
  sheetName: string;
  headers: string[];
  data: (string | number | boolean | null)[][];
  rowCount: number;
  columnCount: number;
}

export interface ProcessedData {
  id: string;
  originalName: string;
  sheets: ExcelData[];
  summary: string;
  createdAt: Date;
}

export interface AnalysisResult {
  generatedCode: string;
  executionResult: string | number | object | null;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  fileData?: ProcessedData;
  analysisResult?: AnalysisResult;
}