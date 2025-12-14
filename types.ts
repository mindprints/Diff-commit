
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

export type FontFamily = 'sans' | 'serif' | 'mono';

export type PolishMode = 'spelling' | 'grammar' | 'polish' | 'prompt' | 'execute' | 'fact-check';

export interface AILogEntry {
  id: string;
  timestamp: number;
  modelId: string;
  modelName: string;
  taskType: string; // e.g., 'Spelling', 'Grammar', 'Full Polish', 'fact-check', custom prompt names, etc.
  inputTokens: number;
  outputTokens: number;
  cost: number;
  durationMs?: number; // Time taken for the AI operation in milliseconds
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

// Git-style commits
export interface TextCommit {
  id: string;
  commitNumber: number;
  content: string;
  timestamp: number;
  summary?: string; // Optional: AI-generated summary of what was in this commit
}

// AI Prompt CRUD system
export interface AIPrompt {
  id: string;               // Unique identifier (e.g., "spelling", "custom_abc123")
  name: string;             // Display name (e.g., "Spelling Fix")
  systemInstruction: string; // System message sent to AI
  promptTask: string;       // Task description prepended to user's text
  isBuiltIn: boolean;       // true = default preset (cannot delete)
  order: number;            // Display order in dropdown (lower = higher)
  color?: string;           // Tailwind color class for dot indicator
  isLocal?: boolean;        // If true, runs locally without API
}

// Project system for organizing text documents
export interface Project {
  id: string;               // UUID
  name: string;             // User-visible name (e.g., "My Essay")
  content: string;          // Current text content
  createdAt: number;        // Timestamp
  updatedAt: number;        // Timestamp
  filePath?: string;        // Electron: real file path, Browser: undefined
}
