import { Project } from '../types';

const STORAGE_KEY = 'diff-commit-projects';

/**
 * Check if running in Electron with project APIs available.
 */
function hasElectronProjectAPI(): boolean {
    // Only check for new FS-based APIs
    return !!(window.electron?.openRepository && window.electron?.createProject);
}

/**
 * Open a local repository (Folder).
 * Returns the path and list of projects found.
 */
export async function openRepository(): Promise<{ path: string; projects: Project[] } | null> {
    if (hasElectronProjectAPI() && window.electron.openRepository) {
        return await window.electron.openRepository();
    }
    return null;
}

/**
 * Get all projects from storage (Browser Fallback).
 * For Electron, this is handled by openRepository() now, but can still return legacy stored projects if needed.
 */
export async function getProjects(): Promise<Project[]> {
    try {
        // Browser fallback - localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
        return [];
    } catch (error) {
        console.error('Failed to load projects:', error);
        return [];
    }
}

/**
 * Save all projects to storage (Browser Fallback).
 */
async function saveAllProjects(projects: Project[]): Promise<void> {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
        console.error('Failed to save projects:', error);
        throw error;
    }
}

/**
 * Get a single project by ID.
 * @deprecated mostly used for browser
 */
export async function getProject(id: string): Promise<Project | null> {
    const projects = await getProjects();
    return projects.find(p => p.id === id) || null;
}

/**
 * Create a new project.
 * @param repoPath - Required for Electron FS mode
 */
export async function createProject(name: string, content: string = '', repoPath?: string): Promise<Project> {
    // Electron FS Mode
    if (hasElectronProjectAPI() && repoPath && window.electron.createProject) {
        const result = await window.electron.createProject(repoPath, name, content);
        if (result) return result;
        throw new Error('Failed to create project on disk');
    }

    // Browser / Legacy Mode
    const projects = await getProjects();
    const newProject: Project = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Untitled Project',
        content,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    const updatedProjects = [...projects, newProject];
    await saveAllProjects(updatedProjects);
    return newProject;
}

/**
 * Save/update a project. 
 * In FS mode, this updates the content.
 */
export async function saveProject(project: Project): Promise<void> {
    // Electron FS Mode
    if (hasElectronProjectAPI() && project.path && window.electron.saveProjectContent) {
        await window.electron.saveProjectContent(project.path, project.content);
        return; // Commits are saved separately via saveProjectCommits
    }

    // Browser / Legacy Mode
    const projects = await getProjects();
    const index = projects.findIndex(p => p.id === project.id);
    const updatedProject = { ...project, updatedAt: Date.now() };

    if (index === -1) {
        await saveAllProjects([...projects, updatedProject]);
    } else {
        const updatedProjects = [...projects];
        updatedProjects[index] = updatedProject;
        await saveAllProjects(updatedProjects);
    }
}

/**
 * Delete a project.
 */
export async function deleteProject(id: string): Promise<void> {
    // For FS mode, deletion is manual on disk for safety now, or we implement a delete handler later.
    // Browser fallback:
    const projects = await getProjects();
    const filtered = projects.filter(p => p.id !== id);
    await saveAllProjects(filtered);
}

/**
 * Rename a project.
 */
export async function renameProject(id: string, newName: string): Promise<Project | null> {
    // FS renaming is complex (move folder), deferring.
    // Browser fallback:
    const projects = await getProjects();
    const project = projects.find(p => p.id === id);

    if (!project) return null;

    const updatedProject = {
        ...project,
        name: newName.trim() || project.name,
        updatedAt: Date.now(),
    };

    const updatedProjects = projects.map(p => p.id === id ? updatedProject : p);
    await saveAllProjects(updatedProjects);
    return updatedProject;
}
