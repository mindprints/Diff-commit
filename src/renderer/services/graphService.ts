/**
 * Graph Service
 * Handles persistence of project node positions and connections.
 */

interface GraphNode {
    id: string; // Project ID (folder name)
    x: number;
    y: number;
}

interface GraphEdge {
    from: string; // Source Project ID
    to: string;   // Target Project ID
}

interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

/**
 * Load the graph data from the repository root.
 */
export async function loadGraphData(repoPath: string): Promise<GraphData> {
    if (window.electron?.loadGraphData) {
        return window.electron.loadGraphData(repoPath);
    }

    // Fallback: LocalStorage for prototype if FS access isn't perfect
    const key = `graph-data-${repoPath}`;
    const stored = localStorage.getItem(key);
    if (stored) {
        return JSON.parse(stored);
    }

    return { nodes: [], edges: [] };
}

/**
 * Save the graph data.
 */
export async function saveGraphData(repoPath: string, data: GraphData): Promise<void> {
    if (window.electron?.saveGraphData) {
        await window.electron.saveGraphData(repoPath, data);
        return;
    }

    const key = `graph-data-${repoPath}`;
    localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Check for cycles in the graph (DFS).
 * Returns true if a cycle exists.
 */
export function hasCycle(nodes: string[], edges: GraphEdge[]): boolean {
    const adj = new Map<string, string[]>();
    edges.forEach(e => {
        if (!adj.has(e.from)) adj.set(e.from, []);
        adj.get(e.from)?.push(e.to);
    });

    const visited = new Set<string>();
    const recStack = new Set<string>();

    function isCyclicUtil(v: string): boolean {
        if (!visited.has(v)) {
            visited.add(v);
            recStack.add(v);

            const children = adj.get(v) || [];
            for (const c of children) {
                if (!visited.has(c) && isCyclicUtil(c)) return true;
                if (recStack.has(c)) return true;
            }
        }
        recStack.delete(v);
        return false;
    }

    for (const node of nodes) {
        if (isCyclicUtil(node)) return true;
    }

    return false;
}

/**
 * Get topological sort of the graph.
 * Returns sorted node IDs or null if cycle detected.
 */
export function getTopologicalSort(nodes: string[], edges: GraphEdge[]): string[] | null {
    if (hasCycle(nodes, edges)) return null;

    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    nodes.forEach(n => inDegree.set(n, 0));
    edges.forEach(e => {
        if (!adj.has(e.from)) adj.set(e.from, []);
        adj.get(e.from)?.push(e.to);
        inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    });

    const queue: string[] = [];
    inDegree.forEach((val, key) => {
        if (val === 0) queue.push(key);
    });

    const result: string[] = [];
    while (queue.length > 0) {
        const u = queue.shift()!;
        result.push(u);

        const children = adj.get(u) || [];
        for (const v of children) {
            inDegree.set(v, (inDegree.get(v) || 0) - 1);
            if (inDegree.get(v) === 0) {
                queue.push(v);
            }
        }
    }

    if (result.length !== nodes.length && nodes.length > 0) {
        // This handles disconnected components correctly, but strictly 
        // if result doesn't cover all nodes it might be odd, 
        // however standard Kahn's algo covers all unless cycle.
        // We might want to just sort the connected subgraph relevant to the merge.
        // For the purpose of this feature, we mostly deal with specific lineages.
    }

    return result;
}
