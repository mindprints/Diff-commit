import { FontFamily } from '../types';

export type FontSize = 'sm' | 'base' | 'lg' | 'xl';

export const fontClasses: Record<FontFamily, string> = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono'
} as const;

export const sizeClasses: Record<FontSize, string> = {
    sm: 'text-sm leading-relaxed',
    base: 'text-base leading-relaxed',
    lg: 'text-lg leading-relaxed',
    xl: 'text-xl leading-relaxed'
} as const;

export const HEADER_HEIGHT_PX = 64;
