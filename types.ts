
export interface DiffSegment {
  id: string;
  value: string;
  type: 'added' | 'removed' | 'unchanged';
  isIncluded: boolean; // Determines if this segment contributes to the final output
  groupId?: string; // Links related segments (e.g. a removal immediately followed by an addition)
}

export enum ViewMode {
  INPUT = 'INPUT',
  DIFF = 'DIFF',
}

export interface SummaryResponse {
  summary: string;
  toneShift?: string;
}

export type FontFamily = 'sans' | 'serif' | 'mono';

export type PolishMode = 'spelling' | 'grammar' | 'polish' | 'prompt' | 'execute' | 'fact-check';

export interface AILogEntry {
  id: string;
  timestamp: number;
  modelId: string;
  modelName: string;
  taskType: 'summary' | 'polish' | 'fact-check-extraction' | 'fact-check-verification';
  inputTokens: number;
  outputTokens: number;
  cost: number;
  rating?: number; // 1-5
  feedback?: string;
  sessionId?: string; // Group related logs (e.g., fact-check session)
}

// Fact-checking types
export type FactClaimCategory = 'causal' | 'frequency' | 'effectiveness' | 'conspiracy' | 'medical' | 'date' | 'statistic' | 'name' | 'place' | 'event' | 'quote' | 'other';
export type VerificationStatus = 'verified' | 'incorrect' | 'outdated' | 'misleading' | 'unverifiable';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface FactClaim {
  id: string;
  claim: string;
  category: FactClaimCategory;
  context: string;
}

export interface VerificationResult {
  claim: FactClaim;
  status: VerificationStatus;
  correction?: string;
  sources: string[];
  confidence: ConfidenceLevel;
  explanation?: string;
}

export interface FactCheckSession {
  claims: FactClaim[];
  verifications: VerificationResult[];
  report: string;
}

// Git-style versioning
export interface TextVersion {
  id: string;
  versionNumber: number;
  content: string;
  timestamp: number;
  summary?: string; // Optional: AI-generated summary of what was in this version
}
