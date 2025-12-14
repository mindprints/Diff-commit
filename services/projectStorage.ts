import { Project } from '../types';

const STORAGE_KEY = 'diff-commit-projects';

/**
 * Project storage service with automatic environment detection.
 * Uses Electron Store in desktop app, localStorage in browser.
 */

/**
 * Check if running in Electron with project APIs available.
 */
function hasElectronProjectAPI(): boolean {
    return !!(window.electron?.getProjects && window.electron?.saveProject);
}

/**
 * Get all projects from storage.
 */
export async function getProjects(): Promise<Project[]> {
    try {
        if (hasElectronProjectAPI()) {
            const projects = await window.electron!.getProjects!();
            return projects || [];
        }

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
 * Save all projects to storage.
 */
async function saveAllProjects(projects: Project[]): Promise<void> {
    try {
        if (hasElectronProjectAPI()) {
            // For Electron, save each project individually
            for (const project of projects) {
                await window.electron!.saveProject!(project);
            }
            return;
        }

        // Browser fallback - localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
        console.error('Failed to save projects:', error);
        throw error;
    }
}

/**
 * Get a single project by ID.
 */
export async function getProject(id: string): Promise<Project | null> {
    const projects = await getProjects();
    return projects.find(p => p.id === id) || null;
}

/**
 * Create a new project.
 */
export async function createProject(name: string, content: string = ''): Promise<Project> {
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
 */
export async function saveProject(project: Project): Promise<void> {
    const projects = await getProjects();
    const index = projects.findIndex(p => p.id === project.id);

    const updatedProject = { ...project, updatedAt: Date.now() };

    if (index === -1) {
        // New project
        await saveAllProjects([...projects, updatedProject]);
    } else {
        // Update existing
        const updatedProjects = [...projects];
        updatedProjects[index] = updatedProject;
        await saveAllProjects(updatedProjects);
    }
}

/**
 * Delete a project.
 */
export async function deleteProject(id: string): Promise<void> {
    const projects = await getProjects();
    const filtered = projects.filter(p => p.id !== id);

    if (hasElectronProjectAPI() && window.electron?.deleteProject) {
        await window.electron.deleteProject(id);
    } else {
        await saveAllProjects(filtered);
    }
}

/**
 * Rename a project.
 */
export async function renameProject(id: string, newName: string): Promise<Project | null> {
    const projects = await getProjects();
    const project = projects.find(p => p.id === id);

    if (!project) {
        return null;
    }

    const updatedProject = {
        ...project,
        name: newName.trim() || project.name,
        updatedAt: Date.now(),
    };

    const updatedProjects = projects.map(p => p.id === id ? updatedProject : p);
    await saveAllProjects(updatedProjects);
    return updatedProject;
}
