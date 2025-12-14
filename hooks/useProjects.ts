import { useState, useEffect, useCallback } from 'react';
import { Project } from '../types';
import * as projectStorage from '../services/projectStorage';

/**
 * Hook for managing projects state.
 * Handles loading, saving, creating, and deleting projects.
 */
export function useProjects() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [currentProject, setCurrentProject] = useState<Project | null>(null);
    const [repositoryPath, setRepositoryPath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load projects on mount
    useEffect(() => {
        const loadProjects = async () => {
            setIsLoading(true);
            try {
                const loaded = await projectStorage.getProjects();
                setProjects(loaded);
            } catch (error) {
                console.error('Failed to load projects:', error);
            }
            setIsLoading(false);
        };
        loadProjects();
    }, []);

    // Open a repository
    const openRepository = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await projectStorage.openRepository();
            if (result) {
                setRepositoryPath(result.path);
                setProjects(result.projects);
                setCurrentProject(null); // Close any active legacy project
            }
        } catch (error) {
            console.error('Failed to open repository:', error);
        }
        setIsLoading(false);
    }, []);

    // Load a specific project
    const loadProject = useCallback(async (id: string) => {
        // If we are in repo mode, find project in state list first
        if (repositoryPath) {
            const project = projects.find(p => p.id === id);
            if (project) {
                // If content is empty (lazy loaded scan), we might need to load it (optional, currently scan reads all)
                setCurrentProject(project);
                return project;
            }
        }

        // Fallback / Legacy
        const project = await projectStorage.getProject(id);
        if (project) {
            setCurrentProject(project);
        }
        return project;
    }, [projects, repositoryPath]);

    // Save current project with new content
    const saveCurrentProject = useCallback(async (content: string) => {
        if (!currentProject) return null;

        const updatedProject: Project = {
            ...currentProject,
            content,
            updatedAt: Date.now(),
        };

        await projectStorage.saveProject(updatedProject);
        setCurrentProject(updatedProject);
        setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
        return updatedProject;
    }, [currentProject]);

    // Create a new project and optionally open it
    const createNewProject = useCallback(async (name: string, content: string = '', open: boolean = true) => {
        const newProject = await projectStorage.createProject(name, content, repositoryPath || undefined);
        setProjects(prev => [...prev, newProject]);
        if (open) {
            setCurrentProject(newProject);
        }
        return newProject;
    }, [repositoryPath]);

    // Delete a project
    const deleteProjectById = useCallback(async (id: string) => {
        await projectStorage.deleteProject(id);
        setProjects(prev => prev.filter(p => p.id !== id));

        // If deleting current project, clear it
        if (currentProject?.id === id) {
            setCurrentProject(null);
        }
    }, [currentProject?.id]);

    // Rename a project
    const renameProjectById = useCallback(async (id: string, newName: string) => {
        const updated = await projectStorage.renameProject(id, newName);
        if (updated) {
            setProjects(prev => prev.map(p => p.id === id ? updated : p));
            if (currentProject?.id === id) {
                setCurrentProject(updated);
            }
        }
        return updated;
    }, [currentProject?.id]);

    // Close current project (without deleting)
    const closeProject = useCallback(() => {
        setCurrentProject(null);
    }, []);

    // Refresh projects list from storage
    const refreshProjects = useCallback(async () => {
        if (repositoryPath) {
            // Re-open/scan repo if needed, but for now just legacy refresh
        }
        const loaded = await projectStorage.getProjects();
        setProjects(loaded);
    }, [repositoryPath]);

    return {
        projects,
        currentProject,
        isLoading,
        repositoryPath,
        openRepository,
        loadProject,
        saveCurrentProject,
        createNewProject,
        deleteProject: deleteProjectById,
        renameProject: renameProjectById,
        closeProject,
        refreshProjects,
    };
}
