/**
 * Hierarchy Types and Constants
 * 
 * Defines the strict folder hierarchy:
 * ROOT → REPOSITORY → PROJECT → commits.json
 */

export type NodeType = 'root' | 'repository' | 'project';

export interface HierarchyMeta {
    type: NodeType;
    createdAt: number;
    name: string;
}

export interface HierarchyInfo {
    path: string;
    type: NodeType;
    name: string;
    allowedChildTypes: NodeType[];
    parentPath: string | null;
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

// Hidden metadata file in each managed directory
export const HIERARCHY_META_FILE = '.hierarchy-meta.json';

// Reserved names that cannot be used for folders (Windows compatibility)
export const RESERVED_NAMES = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
];

// Characters not allowed in folder names
// eslint-disable-next-line no-control-regex
export const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1F]/;
