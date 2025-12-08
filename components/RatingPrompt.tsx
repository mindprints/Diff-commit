
import React, { useState } from 'react';
import { Star } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';

interface RatingProps {
    logId: string;
    onRate: (id: string, rating: number, feedback?: string) => void;
    onDismiss: () => void;
    className?: string;
}

export function RatingPrompt({ logId, onRate, onDismiss, className }: RatingProps) {
    const [rating, setRating] = useState<number>(0);
    const [hoveredRating, setHoveredRating] = useState<number>(0);
    const [feedback, setFeedback] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = () => {
        if (rating > 0) {
            onRate(logId, rating, feedback);
            setSubmitted(true);
            setTimeout(onDismiss, 2000); // Auto dismiss after thank you
        }
    };

    if (submitted) {
        return (
            <div className={clsx("p-4 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-800 animate-in fade-in", className)}>
                <p className="text-sm font-medium text-green-700 dark:text-green-300 text-center">
                    Thanks for your feedback!
                </p>
            </div>
        );
    }

    return (
        <div className={clsx("p-4 rounded-lg bg-white dark:bg-slate-800/90 backdrop-blur-sm border border-indigo-100 dark:border-slate-700 shadow-lg animate-in slide-in-from-right-10 fade-in duration-300", className)}>
            <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Rate Response</h4>
                <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">&times;</button>
            </div>

            <div className="flex gap-1 mb-3 justify-center">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        className="focus:outline-none transition-transform hover:scale-110"
                    >
                        <Star
                            className={clsx(
                                "w-6 h-6 transition-colors",
                                (hoveredRating ? star <= hoveredRating : star <= rating)
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-gray-300 dark:text-slate-600"
                            )}
                        />
                    </button>
                ))}
            </div>

            <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Optional comments..."
                className="w-full text-xs p-2 rounded bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 mb-2 resize-none h-16 text-gray-700 dark:text-slate-300"
            />

            <Button onClick={handleSubmit} size="sm" className="w-full" disabled={rating === 0}>
                Submit Score
            </Button>
        </div>
    );
}
