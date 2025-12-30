/**
 * Hierarchy Service
 * 
 * Core operations for managing the strict folder hierarchy:
 * ROOT → REPOSITORY → PROJECT → commits.json
 */

import fs from 'fs';
import path from 'path';
import {
    NodeType,
    HierarchyMeta,
    HierarchyInfo,
    ValidationResult,
    HIERARCHY_META_FILE,
    RESERVED_NAMES,
    INVALID_CHARS
} from './hierarchyTypes';

/**
 * Read hierarchy metadata from a directory.
 * Returns null if no metadata exists (root directory).
 */
export function readHierarchyMeta(dirPath: string): HierarchyMeta | null {
    const metaPath = path.join(dirPath, HIERARCHY_META_FILE);
    try {
        if (fs.existsSync(metaPath)) {
            const data = fs.readFileSync(metaPath, 'utf-8');
            return JSON.parse(data) as HierarchyMeta;
        }
    } catch (e) {
        console.warn('Failed to read hierarchy metadata:', e);
    }
    return null;
}

/**
 * Write hierarchy metadata to a directory.
 */
export function writeHierarchyMeta(dirPath: string, meta: HierarchyMeta): void {
    const metaPath = path.join(dirPath, HIERARCHY_META_FILE);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Get the type of a directory node.
 * Returns 'root' if no hierarchy metadata exists.
 */
export function getNodeType(dirPath: string): NodeType {
    const meta = readHierarchyMeta(dirPath);
    return meta?.type || 'root';
}

/**
 * Walk UP the directory tree to find the nearest ancestor with hierarchy metadata.
 * This is crucial for validating nested paths like "newFolder\subFolder\repo"
 * where the intermediate folders don't exist yet.
 * 
 * Returns { type, path } of the nearest ancestor with metadata, or null if none found.
 */
export function findAncestorWithHierarchy(dirPath: string): { type: NodeType; path: string } | null {
    let currentPath = dirPath;
    const root = path.parse(currentPath).root;

    // Walk up the tree until we hit the filesystem root
    while (currentPath !== root && currentPath.length > root.length) {
        // Check if current directory exists and has hierarchy metadata
        if (fs.existsSync(currentPath)) {
            const meta = readHierarchyMeta(currentPath);
            if (meta) {
                return { type: meta.type, path: currentPath };
            }
        }

        // Move up to parent
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) break; // Safety check for root
        currentPath = parentPath;
    }

    return null;
}

/**
 * Check if a path or any of its ancestors is inside a repository or project.
 * Used to validate before creating new repos - prevents nested repos/projects.
 */
export function isInsideHierarchyNode(targetPath: string): { isInside: boolean; ancestorType?: NodeType; ancestorPath?: string } {
    const ancestor = findAncestorWithHierarchy(targetPath);
    if (ancestor) {
        return {
            isInside: true,
            ancestorType: ancestor.type,
            ancestorPath: ancestor.path
        };
    }
    return { isInside: false };
}

/**
 * Get allowed child types for a given node type.
 */
export function getAllowedChildTypes(nodeType: NodeType): NodeType[] {
    switch (nodeType) {
        case 'root':
            return ['repository'];
        case 'repository':
            return ['project'];
        case 'project':
            return []; // Projects can only contain commits (handled automatically)
        default:
            return [];
    }
}

/**
 * Check if a specific child type can be created in a parent node.
 */
export function canCreateChild(parentType: NodeType, childType: NodeType): boolean {
    const allowed = getAllowedChildTypes(parentType);
    return allowed.includes(childType);
}

/**
 * Validate a folder name.
 */
export function validateName(name: string): ValidationResult {
    // Empty check
    if (!name || name.trim().length === 0) {
        return { valid: false, error: 'Name cannot be empty' };
    }

    const trimmed = name.trim();

    // Length check
    if (trimmed.length > 255) {
        return { valid: false, error: 'Name is too long (max 255 characters)' };
    }

    // Invalid characters check
    if (INVALID_CHARS.test(trimmed)) {
        return { valid: false, error: 'Name contains invalid characters (< > : " / \\ | ? *)' };
    }

    // Reserved names check (Windows)
    const upperName = trimmed.toUpperCase();
    if (RESERVED_NAMES.includes(upperName) || RESERVED_NAMES.some(r => upperName.startsWith(r + '.'))) {
        return { valid: false, error: `"${trimmed}" is a reserved system name` };
    }

    // Dot checks
    if (trimmed === '.' || trimmed === '..') {
        return { valid: false, error: 'Name cannot be "." or ".."' };
    }

    if (trimmed.startsWith('.')) {
        return { valid: false, error: 'Name cannot start with a dot' };
    }

    // Trailing dot or space (Windows compatibility)
    if (trimmed.endsWith('.') || trimmed.endsWith(' ')) {
        return { valid: false, error: 'Name cannot end with a dot or space' };
    }

    return { valid: true };
}

/**
 * Check if a name already exists in the parent directory.
 */
export function checkNameExists(parentPath: string, name: string): boolean {
    const targetPath = path.join(parentPath, name.trim());
    return fs.existsSync(targetPath);
}

/**
 * Validate if a node can be created.
 */
export function validateCreate(
    parentPath: string,
    name: string,
    childType: NodeType
): ValidationResult {
    // Validate name first
    const nameValidation = validateName(name);
    if (!nameValidation.valid) {
        return nameValidation;
    }

    // Check parent type
    const parentType = getNodeType(parentPath);

    // Check hierarchy rules
    if (!canCreateChild(parentType, childType)) {
        const parentLabel = parentType === 'root' ? 'this location' : `a ${parentType}`;
        return {
            valid: false,
            error: `Cannot create a ${childType} inside ${parentLabel}. ` +
                `Allowed: ${getAllowedChildTypes(parentType).join(', ') || 'none'}`
        };
    }

    // Check if name already exists
    if (checkNameExists(parentPath, name)) {
        return { valid: false, error: `"${name.trim()}" already exists` };
    }

    return { valid: true };
}

/**
 * Create a new node (repository or project) with proper metadata.
 */
export function createNode(
    parentPath: string,
    name: string,
    nodeType: NodeType
): { path: string; meta: HierarchyMeta } | null {
    // Validate first
    const validation = validateCreate(parentPath, name, nodeType);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const trimmedName = name.trim();
    const nodePath = path.join(parentPath, trimmedName);
    const now = Date.now();

    try {
        // Create the directory
        fs.mkdirSync(nodePath, { recursive: true });

        // Create hierarchy metadata
        const meta: HierarchyMeta = {
            type: nodeType,
            createdAt: now,
            name: trimmedName
        };
        writeHierarchyMeta(nodePath, meta);

        // If it's a project, also create the .diff-commit directory
        if (nodeType === 'project') {
            const diffCommitPath = path.join(nodePath, '.diff-commit');
            fs.mkdirSync(diffCommitPath, { recursive: true });

            // Create empty commits.json
            fs.writeFileSync(
                path.join(diffCommitPath, 'commits.json'),
                '[]',
                'utf-8'
            );

            // Create content.md
            fs.writeFileSync(
                path.join(nodePath, 'content.md'),
                '',
                'utf-8'
            );

            // Create project metadata in .diff-commit
            fs.writeFileSync(
                path.join(diffCommitPath, 'metadata.json'),
                JSON.stringify({ createdAt: now }, null, 2),
                'utf-8'
            );
        }

        console.log(`[Hierarchy] Created ${nodeType}: ${nodePath}`);
        return { path: nodePath, meta };
    } catch (e) {
        console.error(`[Hierarchy] Failed to create ${nodeType}:`, e);
        throw e;
    }
}

/**
 * Get hierarchy information for a directory.
 */
export function getHierarchyInfo(dirPath: string): HierarchyInfo {
    const meta = readHierarchyMeta(dirPath);
    const nodeType = meta?.type || 'root';
    const name = meta?.name || path.basename(dirPath);

    return {
        path: dirPath,
        type: nodeType,
        name,
        allowedChildTypes: getAllowedChildTypes(nodeType),
        parentPath: path.dirname(dirPath)
    };
}

/**
 * List children of a directory with their types.
 */
export function listChildren(dirPath: string): Array<{ name: string; type: NodeType; path: string }> {
    const children: Array<{ name: string; type: NodeType; path: string }> = [];

    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory() && !item.name.startsWith('.')) {
                const childPath = path.join(dirPath, item.name);
                const childType = getNodeType(childPath);
                children.push({
                    name: item.name,
                    type: childType,
                    path: childPath
                });
            }
        }
    } catch (e) {
        console.error('[Hierarchy] Failed to list children:', e);
    }

    return children;
}
