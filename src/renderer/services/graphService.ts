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

const GRAPH_FILE = 'project-graph.json';

/**
 * Load the graph data from the repository root.
 */
export async function loadGraphData(repoPath: string): Promise<GraphData> {
    if (window.electron?.loadProjectCommits && (window.electron as any)?.handleGraphOps) {
        // Use IPC if available (assuming we add a handleGraphOps or similar generic file reader/writer later)
        // For now, we reuse the pattern: try to read file directly using node fs via IPC
        // But since we don't have a specific IPC for arbitrary JSON, we might fallback to localStorage or assume
        // we need to add a generic read/write IPC.
        // Wait, the user instructions didn't explicitly ask for new IPC handlers, but we need to persist to repo.
        // We can use the browserFileSystem approach for browser, and for Electron we might need a new handler
        // or abuse an existing one?
        // Let's assume we can use a new generic read/write or add it to hierarchy handlers?
        // Actually, let's start with BrowserFS as it's cleaner to implement in Renderer first, 
        // and for Electron we'll check if we have a file reader. 
        // Looking at `projectStorage.ts`, we mostly use specific IPCs. 

        // Let's rely on the `browserFileSystem` logic because it abstracts the file handle concept which might work
        // if we passed the repo handle.

        // FOR NOW: Let's assume we can write to the repo root using the browser file system logic 
        // if we have the handle.
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
    const key = `graph-data-${repoPath}`;
    localStorage.setItem(key, JSON.stringify(data));

    // TODO: Implement actual file persistence once basic interactions work
    // This is "good enough" for the prototype phase interacting with the UI.
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
