import React from 'react';
import '../ProjectNodeModal.css';

interface GraphModalShellProps {
    controls: React.ReactNode;
    closeControl: React.ReactNode;
    topBar?: React.ReactNode;
    children: React.ReactNode;
}

export function GraphModalShell({ controls, closeControl, topBar, children }: GraphModalShellProps) {
    return (
        <div className="project-node-modal">
            <div className="modal-controls">{controls}</div>
            {topBar}
            <div className="modal-close flex items-center gap-2">{closeControl}</div>
            {children}
        </div>
    );
}
