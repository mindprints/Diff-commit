export const BOUNDARY_CHARS = /[\s.,;:!?'"()\[\]{}<>\/\\|@#$%^&*+=~`\-_\n\r\t]/;

/**
 * Expand a selection range to the nearest word boundaries.
 * Auto-corrects for users who don't precisely select from word start to word end.
 */
export function expandToWordBoundaries(start: number, end: number, text: string): { start: number; end: number } {
    if (text.length === 0 || start >= text.length) {
        return { start, end };
    }

    let expandedStart = start;
    let expandedEnd = end;

    // Expand start backwards until we hit a boundary or beginning of text
    while (expandedStart > 0 && !BOUNDARY_CHARS.test(text[expandedStart - 1])) {
        expandedStart--;
    }

    // Expand end forwards until we hit a boundary or end of text
    while (expandedEnd < text.length && !BOUNDARY_CHARS.test(text[expandedEnd])) {
        expandedEnd++;
    }

    return { start: expandedStart, end: expandedEnd };
}
