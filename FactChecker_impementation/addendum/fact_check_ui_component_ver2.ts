// components/FactCheckResults.tsx
import React, { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import clsx from 'clsx';
import type { VerificationResult } from '../types/factCheck';

interface FactCheckResultsProps {
  verifications: VerificationResult[];
  report: string;
  onClose?: () => void;
}

export const FactCheckResults: React.FC<FactCheckResultsProps> = ({
  verifications,
  report,
  onClose
}) => {
  const [expandedClaims, setExpandedClaims] = useState<Set<string>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const toggleClaim = (claimId: string) => {
    const newExpanded = new Set(expandedClaims);
    if (newExpanded.has(claimId)) {
      newExpanded.delete(claimId);
    } else {
      newExpanded.add(claimId);
    }
    setExpandedClaims(newExpanded);
  };

  const copyCorrection = async (correction: string, index: number) => {
    await navigator.clipboard.writeText(correction);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Group by status
  const groupedResults = {
    verified: verifications.filter(v => v.status === 'verified'),
    incorrect: verifications.filter(v => v.status === 'incorrect'),
    outdated: verifications.filter(v => v.status === 'outdated'),
    unverifiable: verifications.filter(v => v.status === 'unverifiable'),
  };

  const getStatusConfig = (status: VerificationResult['status']) => {
    switch (status) {
      case 'verified':
        return {
          icon: CheckCircle2,
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-800',
          label: 'Verified',
        };
      case 'incorrect':
        return {
          icon: XCircle,
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-800',
          label: 'Incorrect',
        };
      case 'outdated':
        return {
          icon: AlertTriangle,
          color: 'text-orange-600 dark:text-orange-400',
          bgColor: 'bg-orange-50 dark:bg-orange-900/20',
          borderColor: 'border-orange-200 dark:border-orange-800',
          label: 'Outdated',
        };
      case 'unverifiable':
        return {
          icon: HelpCircle,
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-900/20',
          borderColor: 'border-gray-200 dark:border-gray-800',
          label: 'Unverifiable',
        };
    }
  };

  const getConfidenceBadge = (confidence: VerificationResult['confidence']) => {
    const config = {
      high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      low: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
    };
    return config[confidence];
  };

  const getCategoryInfo = (category: string) => {
    const categoryMap: Record<string, { label: string; emoji: string; color: string }> = {
      causal: { label: 'Causal Claim', emoji: '🔗', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
      frequency: { label: 'Frequency', emoji: '📊', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
      effectiveness: { label: 'Effectiveness', emoji: '⚡', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
      conspiracy: { label: 'Conspiracy Theory', emoji: '🕵️', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
      medical: { label: 'Medical Claim', emoji: '⚕️', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300' },
      date: { label: 'Date', emoji: '📅', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300' },
      statistic: { label: 'Statistic', emoji: '📈', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' },
      name: { label: 'Name', emoji: '👤', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
      place: { label: 'Place', emoji: '📍', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
      event: { label: 'Event', emoji: '🎯', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
      quote: { label: 'Quote', emoji: '💬', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300' },
      other: { label: 'Other', emoji: '❓', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300' },
    };
    return categoryMap[category] || categoryMap.other;
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Fact Check Results
            </h3>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* Summary Stats */}
        <div className="flex gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-gray-700 dark:text-gray-300">
              {groupedResults.verified.length} Verified
            </span>
          </div>
          {groupedResults.incorrect.length > 0 && (
            <div className="flex items-center gap-1">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-gray-700 dark:text-gray-300">
                {groupedResults.incorrect.length} Incorrect
              </span>
            </div>
          )}
          {groupedResults.outdated.length > 0 && (
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <span className="text-gray-700 dark:text-gray-300">
                {groupedResults.outdated.length} Outdated
              </span>
            </div>
          )}
          {groupedResults.unverifiable.length > 0 && (
            <div className="flex items-center gap-1">
              <HelpCircle className="w-4 h-4 text-gray-600" />
              <span className="text-gray-700 dark:text-gray-300">
                {groupedResults.unverifiable.length} Unverifiable
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Results List */}
      <div className="max-h-96 overflow-y-auto">
        {verifications.map((verification, index) => {
          const config = getStatusConfig(verification.status);
          const Icon = config.icon;
          const isExpanded = expandedClaims.has(verification.claim.id);

          return (
            <div
              key={verification.claim.id}
              className={clsx(
                'border-l-4 m-2 rounded-lg overflow-hidden transition-all',
                config.borderColor,
                config.bgColor
              )}
            >
              {/* Claim Header */}
              <button
                onClick={() => toggleClaim(verification.claim.id)}
                className="w-full px-4 py-3 flex items-start gap-3 hover:opacity-80 transition-opacity"
              >
                <Icon className={clsx('w-5 h-5 mt-0.5 flex-shrink-0', config.color)} />
                
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('font-medium', config.color)}>
                      {config.label}
                    </span>
                    <span className={clsx(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      getConfidenceBadge(verification.confidence)
                    )}>
                      {verification.confidence} confidence
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                    "{verification.claim.claim}"
                  </p>
                  
                  {verification.correction && !isExpanded && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      → {verification.correction}
                    </p>
                  )}
                </div>

                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-gray-700/50 pt-3">
                  {/* Context */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Context
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                      ...{verification.claim.context}...
                    </p>
                  </div>

                  {/* Correction with Copy Button */}
                  {verification.correction && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                          Suggested Correction
                        </p>
                        <button
                          onClick={() => copyCorrection(verification.correction!, index)}
                          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          {copiedIndex === index ? (
                            <>
                              <Check className="w-3 h-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                        {verification.correction}
                      </p>
                    </div>
                  )}

                  {/* Sources */}
                  {verification.sources.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                        Sources
                      </p>
                      <ul className="space-y-1">
                        {verification.sources.map((source, i) => (
                          <li key={i}>
                            <a
                              href={source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {new URL(source).hostname}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Category Badge */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {verification.claim.category}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Empty State */}
        {verifications.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No factual claims found to verify</p>
          </div>
        )}
      </div>

      {/* Report Section (Collapsible) */}
      {report && (
        <details className="border-t border-gray-200 dark:border-gray-700">
          <summary className="px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
            View Full Report
          </summary>
          <pre className="px-4 py-3 text-xs bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 overflow-x-auto">
            {report}
          </pre>
        </details>
      )}
    </div>
  );
};

// Example integration in your main component
export const FactCheckButton: React.FC<{
  text: string;
  apiKey: string;
  onComplete: (results: any) => void;
}> = ({ text, apiKey, onComplete }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');

  const handleFactCheck = async () => {
    setIsChecking(true);
    
    try {
      const { handleFactCheck } = await import('../services/factChecker');
      
      const results = await handleFactCheck(
        text,
        apiKey,
        (stage, progress) => {
          setProgressText(stage);
          setProgress(progress);
        }
      );
      
      onComplete(results);
    } catch (error) {
      console.error('Fact check failed:', error);
      // Show error toast
    } finally {
      setIsChecking(false);
      setProgress(0);
    }
  };

  return (
    <button
      onClick={handleFactCheck}
      disabled={isChecking || !text.trim()}
      className={clsx(
        'px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2',
        isChecking
          ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-wait'
          : 'bg-blue-600 hover:bg-blue-700 text-white'
      )}
    >
      <CheckCircle2 className="w-4 h-4" />
      {isChecking ? (
        <>
          <span>{progressText}</span>
          <span className="text-xs opacity-75">({progress}%)</span>
        </>
      ) : (
        'Fact Check'
      )}
    </button>
  );
};