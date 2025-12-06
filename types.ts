
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

export type PolishMode = 'spelling' | 'grammar' | 'polish' | 'prompt';
