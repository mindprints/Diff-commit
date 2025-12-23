import React, { ReactNode } from 'react';
import { UIProvider } from './UIContext';
import { EditorProvider } from './EditorContext';
import { ProjectProvider } from './ProjectContext';
import { AIProvider } from './AIContext';

export function CombinedProvider({ children }: { children: ReactNode }) {
    return (
        <UIProvider>
            <EditorProvider>
                <ProjectProvider>
                    <AIProvider>
                        {children}
                    </AIProvider>
                </ProjectProvider>
            </EditorProvider>
        </UIProvider>
    );
}

export * from './UIContext';
export * from './EditorContext';
export * from './ProjectContext';
export * from './AIContext';
