import Typo from 'typo-js';

export interface SpellCheckResult {
    text: string;           // Corrected text
    corrections: number;    // Count of corrections made
    isError?: boolean;
    errorMessage?: string;
}

// Initialize dictionary (loads async)
let dictionary: Typo | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

// Dictionary paths - handle both Electron (extraResources) and browser (relative path)
function getDictionaryPath(filename: string): string {
    // In packaged Electron, dictionaries are in resourcesPath/dictionaries/
    if (typeof window !== 'undefined' && window.electron?.resourcesPath) {
        return `file://${window.electron.resourcesPath}/dictionaries/${filename}`;
    }
    // In dev or browser, use relative path
    return `./dictionaries/${filename}`;
}

export async function initSpellChecker(): Promise<void> {
    if (dictionary) return;
    if (isInitializing) return initPromise!;

    isInitializing = true;
    initPromise = (async () => {
        try {
            const [affData, dicData] = await Promise.all([
                fetch(getDictionaryPath('en_US.aff')).then(r => {
                    if (!r.ok) throw new Error(`Failed to load .aff: ${r.statusText}`);
                    return r.text();
                }),
                fetch(getDictionaryPath('en_US.dic')).then(r => {
                    if (!r.ok) throw new Error(`Failed to load .dic: ${r.statusText}`);
                    return r.text();
                })
            ]);

            dictionary = new Typo('en_US', affData, dicData);
            console.log('Local Spell Checker Initialized');
        } catch (e) {
            console.error('Failed to initialize spell checker', e);
            throw e;
        } finally {
            isInitializing = false;
            initPromise = null;
        }
    })();

    return initPromise;
}

export function checkSpelling(text: string): SpellCheckResult {
    if (!dictionary) {
        return { text, corrections: 0, isError: true, errorMessage: 'Spell checker not initialized' };
    }

    let corrections = 0;

    // Regex breakdown:
    // 1. skipGroup: Matches things we want to preserve and ignore
    //    - ```[\s\S]*?``` : Multiline code blocks
    //    - `[^`\n]*`      : Inline code
    //    - https?://...   : URLs
    //    - [^\s]+@[^\s]+  : Emails
    // 2. wordGroup: Matches words we want to check
    //    - \b[a-zA-Z']+\b : Words consisting of letters and apostrophes, surrounded by word boundaries. 
    //                       This avoids matching parts of identifiers like 'var1' or 'camelCase'.
    const regex = /(```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s)]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|(\b[a-zA-Z']+\b)/g;

    const correctedText = text.replace(regex, (match, skipGroup, wordGroup) => {
        if (skipGroup) {
            return skipGroup;
        }
        if (wordGroup) {
            // Check if word is correct
            if (dictionary!.check(wordGroup)) {
                return wordGroup;
            }

            // It is misspelled. Get suggestions.
            const suggestions = dictionary!.suggest(wordGroup);
            if (suggestions && suggestions.length > 0) {
                corrections++;
                // Apply case matching to the first suggestion
                return matchCase(wordGroup, suggestions[0]);
            }
            // No suggestions found, keep original
            return wordGroup;
        }
        return match;
    });

    return {
        text: correctedText,
        corrections,
        isError: false
    };
}

export function getSuggestions(word: string): string[] {
    if (!dictionary) return [];
    return dictionary.suggest(word);
}

function matchCase(original: string, replacement: string): string {
    if (!original || !replacement) return replacement;

    if (original === original.toUpperCase()) {
        return replacement.toUpperCase();
    }
    if (original === original.toLowerCase()) {
        return replacement.toLowerCase();
    }
    if (original[0] === original[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
}
