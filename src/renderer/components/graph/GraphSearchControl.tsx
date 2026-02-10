import React from 'react';
import { Search, X } from 'lucide-react';

interface GraphSearchControlProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
}

export function GraphSearchControl({
    value,
    onChange,
    placeholder = 'Search...',
    className = '',
    inputClassName = '',
}: GraphSearchControlProps) {
    return (
        <div className={`relative ${className}`}>
            <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`h-8 pl-8 pr-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none ${inputClassName}`}
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
                    title="Clear search"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}
