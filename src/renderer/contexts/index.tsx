import React, { ReactNode } from 'react';
import { UIProvider } from './UIContext';
import { EditorProvider } from './EditorContext';
import { ProjectProvider } from './ProjectContext';
import { AIProvider } from './AIContext';
import { ModelsProvider } from './ModelsContext';
import { RepoIntelProvider } from './RepoIntelContext';

export function CombinedProvider({ children }: { children: ReactNode }) {
    return (
        <UIProvider>
            <ModelsProvider>
                <EditorProvider>
                    <ProjectProvider>
                        <AIProvider>
                            <RepoIntelProvider>
                                {children}
                            </RepoIntelProvider>
                        </AIProvider>
                    </ProjectProvider>
                </EditorProvider>
            </ModelsProvider>
        </UIProvider>
    );
}

export * from './UIContext';
export * from './EditorContext';
export * from './ProjectContext';
export * from './AIContext';
export * from './ModelsContext';
export * from './RepoIntelContext';
