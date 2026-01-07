import { useState, useEffect, useCallback, useRef } from 'react';
import { Project } from '../types';
import * as projectStorage from '../services/projectStorage';
import * as browserFS from '../services/browserFileSystem';

/**
 * Hook for managing projects state.
 * Handles loading, saving, creating, and deleting projects.
 * Supports both Electron file system and browser File System Access API.
 */
export function useProjects() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [currentProject, setCurrentProject] = useState<Project | null>(null);
    const [repositoryPath, setRepositoryPath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Store the FileSystemDirectoryHandle for browser mode
    const repoHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

    // Check if we're in Electron
    const isElectron = !!(window.electron?.openRepository);

    // Load projects on mount
    useEffect(() => {
        const loadProjectsAndRepo = async () => {
            setIsLoading(true);
            try {
                // In Electron mode, clear legacy localStorage data on startup
                // This prevents conflicts with the file-based project system
                if (isElectron) {
                    // In Electron mode, clear legacy localStorage data on startup
                    // to prevent conflicts with the new file-based project system.
                    // This ensures a clean slate until a repository is opened.
                    localStorage.removeItem('diff-commit-projects');
                    localStorage.removeItem('diff-commit-repository');
                    localStorage.removeItem('diff-commit-commits');
                    setProjects([]);
                } else {
                    // In browser mode, we can't auto-restore the handle (user must re-pick)
                    // Just load any localStorage projects as fallback
                    const loaded = await projectStorage.getProjects();
                    setProjects(loaded);
                }
            } catch (error) {
                console.error('Failed to load projects:', error);
            }
            setIsLoading(false);
        };
        loadProjectsAndRepo();
    }, [isElectron]);

    // Open a repository - works for both Electron and Browser
    const openRepository = useCallback(async () => {
        setIsLoading(true);
        try {
            if (isElectron) {
                // Electron mode - use IPC
                const result = await projectStorage.openRepository();
                if (result) {
                    // Clear legacy localStorage data to prevent conflicts
                    // with file-based project system
                    localStorage.removeItem('diff-commit-projects');
                    localStorage.removeItem('diff-commit-repository');
                    localStorage.removeItem('diff-commit-commits');

                    setRepositoryPath(result.path);
                    setProjects(result.projects);
                    setCurrentProject(null);

                    // Save for skip preloading feature
                    localStorage.setItem('last_repository_path', result.path);
                }
            } else if (browserFS.isFileSystemAccessSupported()) {
                // Browser mode - use File System Access API
                const result = await browserFS.openBrowserDirectory();
                if (result) {
                    repoHandleRef.current = result.handle;
                    setRepositoryPath(result.path);
                    setProjects(result.projects);
                    setCurrentProject(null);
                }
            } else {
                console.warn('File System Access API not supported in this browser');
            }
        } catch (error) {
            console.error('Failed to open repository:', error);
        }
        setIsLoading(false);
    }, [isElectron]);

    // Create a new repository (folder on disk)
    const createRepository = useCallback(async () => {
        setIsLoading(true);
        try {
            if (isElectron) {
                // Electron mode - use IPC to show save dialog
                const result = await projectStorage.createRepository();
                if (result) {
                    // Clear legacy localStorage data to prevent conflicts
                    localStorage.removeItem('diff-commit-projects');
                    localStorage.removeItem('diff-commit-repository');
                    localStorage.removeItem('diff-commit-commits');

                    setRepositoryPath(result.path);
                    setProjects(result.projects);

                    // Auto-load the first project (usually timestamped)
                    if (result.projects.length > 0) {
                        setCurrentProject(result.projects[0]);
                    } else {
                        setCurrentProject(null);
                    }
                }
                return result;
            } else if (browserFS.isFileSystemAccessSupported()) {
                // Browser mode - use File System Access API (same as open, user picks a folder)
                const result = await browserFS.openBrowserDirectory();
                if (result) {
                    repoHandleRef.current = result.handle;
                    setRepositoryPath(result.path);
                    setProjects(result.projects);
                    setCurrentProject(null);
                    return { path: result.path, projects: result.projects };
                }
            } else {
                // Fallback to localStorage-based virtual repository
                const result = await projectStorage.createRepository();
                if (result) {
                    setRepositoryPath(result.path);
                    setProjects(result.projects);
                    setCurrentProject(null);
                }
                return result;
            }
            return null;
        } catch (error) {
            console.error('Failed to create repository:', error);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [isElectron]);

    // Load a specific project - ALWAYS re-read content from disk
    const loadProject = useCallback(async (id: string) => {
        // Find project in state to get the path
        const project = projects.find(p => p.id === id);
        if (!project) {
            // Fallback - try from storage
            const loadedProject = await projectStorage.getProject(id);
            if (loadedProject) {
                setCurrentProject(loadedProject);
            }
            return loadedProject;
        }

        // Re-read content from disk to get latest
        let freshContent = project.content;

        if (isElectron && project.path && window.electron?.loadProjectContent) {
            // Electron mode - use IPC to read content.md
            try {
                freshContent = await window.electron.loadProjectContent(project.path);
            } catch (e) {
                console.log('Using cached content for project:', project.name, e);
            }
        } else if (repoHandleRef.current) {
            // Browser mode - re-read from file system
            try {
                const projectHandle = await repoHandleRef.current.getDirectoryHandle(project.name);
                const contentHandle = await projectHandle.getFileHandle('content.md');
                const file = await contentHandle.getFile();
                freshContent = await file.text();
            } catch {
                // Use cached content if can't read
                console.log('Using cached content for project:', project.name);
            }
        }

        const freshProject = { ...project, content: freshContent };
        setCurrentProject(freshProject);
        setProjects(prev => prev.map(p => p.id === id ? freshProject : p));
        return freshProject;
    }, [projects, isElectron]);

    // Save current project content to disk
    const saveCurrentProject = useCallback(async (content: string) => {
        if (!currentProject) return null;

        const updatedProject: Project = {
            ...currentProject,
            content,
            updatedAt: Date.now(),
        };

        // Save to file system
        if (isElectron && currentProject.path) {
            // Electron mode - save to content.md in project folder
            if (window.electron?.saveProjectContent) {
                await window.electron.saveProjectContent(currentProject.path, content);
            }
        } else if (repoHandleRef.current && currentProject.name) {
            // Browser mode - save to content.md
            await browserFS.saveProjectDraft(repoHandleRef.current, currentProject.name, content);
        } else {
            // localStorage fallback
            await projectStorage.saveProject(updatedProject);
        }

        setCurrentProject(updatedProject);
        setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
        return updatedProject;
    }, [currentProject, isElectron]);

    // Create a new project
    const createNewProject = useCallback(async (name: string, content: string = '', open: boolean = true) => {
        let newProject: Project;

        if (isElectron && repositoryPath) {
            // Electron mode
            newProject = await projectStorage.createProject(name, content, repositoryPath);
        } else if (repoHandleRef.current) {
            // Browser file system mode
            const result = await browserFS.createProjectFolder(repoHandleRef.current, name, content);
            if (!result) throw new Error('Failed to create project');
            newProject = result;
        } else {
            // localStorage fallback
            newProject = await projectStorage.createProject(name, content);
        }

        setProjects(prev => [...prev, newProject]);
        if (open) {
            setCurrentProject(newProject);
        }
        return newProject;
    }, [isElectron, repositoryPath]);

    // Delete a project
    const deleteProjectById = useCallback(async (id: string) => {
        const project = projects.find(p => p.id === id);

        if (repoHandleRef.current && project) {
            // Browser file system mode
            await browserFS.deleteProjectFolder(repoHandleRef.current, project.name);
        } else {
            // Electron or localStorage
            await projectStorage.deleteProject(id);
        }

        setProjects(prev => prev.filter(p => p.id !== id));
        if (currentProject?.id === id) {
            setCurrentProject(null);
        }
    }, [projects, currentProject?.id]);

    // Rename a project
    const renameProjectById = useCallback(async (id: string, newName: string) => {
        const project = projects.find(p => p.id === id);
        if (!project) return null;

        let updated: Project | null = null;

        if (repoHandleRef.current) {
            // Browser file system mode
            updated = await browserFS.renameProjectFolder(repoHandleRef.current, project.name, newName);
        } else if (project.path) {
            // Electron mode - project has a path on disk
            updated = await projectStorage.renameProject(id, newName, project.path);
        } else {
            // localStorage mode - no path, use id-based rename
            updated = await projectStorage.renameProject(id, newName);
        }

        if (updated) {
            // The project ID changes to the new name, so we need to filter out the old one
            // and insert the updated project
            setProjects(prev => {
                const filtered = prev.filter(p => p.id !== id);
                return [...filtered, updated!];
            });
            if (currentProject?.id === id) {
                setCurrentProject(updated);
            }
        }
        return updated;
    }, [projects, currentProject?.id]);

    // Close current project
    const closeProject = useCallback(() => {
        setCurrentProject(null);
    }, []);

    // Refresh projects list
    const refreshProjects = useCallback(async () => {
        if (repoHandleRef.current) {
            // Browser file system - rescan
            const scanned = await browserFS.scanProjectFolders(repoHandleRef.current);
            setProjects(scanned);
        } else {
            // localStorage
            const loaded = await projectStorage.getProjects();
            setProjects(loaded);
        }
    }, []);

    // Get repo handle for external use (e.g., saving commits)
    const getRepoHandle = useCallback(() => repoHandleRef.current, []);

    return {
        projects,
        currentProject,
        isLoading,
        repositoryPath,
        openRepository,
        createRepository,
        loadProject,
        saveCurrentProject,
        createNewProject,
        deleteProject: deleteProjectById,
        renameProject: renameProjectById,
        closeProject,
        refreshProjects,
        getRepoHandle,
    };
}
