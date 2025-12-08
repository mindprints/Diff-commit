// Example of how fact check logs integrate with your existing logs viewer

// Sample log entries that would be saved:
const exampleFactCheckLogs = [
  {
    timestamp: "2024-12-08T14:23:15.000Z",
    task: "fact-check-extraction",
    model: "DeepSeek V3",
    inputTokens: 1842,
    outputTokens: 324,
    cost: 0.000348,
    claimsProcessed: undefined,
    rating: 5,
    sessionId: 1733668995000
  },
  {
    timestamp: "2024-12-08T14:23:18.000Z",
    task: "fact-check-verification",
    model: "Perplexity Sonar Large",
    inputTokens: 256,
    outputTokens: 145,
    cost: 0.000401,
    claimsProcessed: 1,
    rating: 5,
    sessionId: 1733668995000
  },
  {
    timestamp: "2024-12-08T14:23:22.000Z",
    task: "fact-check-verification",
    model: "Perplexity Sonar Large",
    inputTokens: 289,
    outputTokens: 178,
    cost: 0.000467,
    claimsProcessed: 1,
    rating: 5,
    sessionId: 1733668995000
  },
  {
    timestamp: "2024-12-08T14:23:26.000Z",
    task: "fact-check-verification",
    model: "Perplexity Sonar Large",
    inputTokens: 312,
    outputTokens: 156,
    cost: 0.000468,
    claimsProcessed: 1,
    rating: 5,
    sessionId: 1733668995000
  }
];

// Enhanced logs viewer component to display fact check sessions
export const EnhancedLogsViewer: React.FC<{ logs: any[] }> = ({ logs }) => {
  // Group fact check logs by sessionId
  const groupedLogs = logs.reduce((acc, log) => {
    if (log.task?.startsWith('fact-check')) {
      const sessionId = log.sessionId || log.timestamp;
      if (!acc[sessionId]) {
        acc[sessionId] = [];
      }
      acc[sessionId].push(log);
    }
    return acc;
  }, {} as Record<string, any[]>);

  const renderFactCheckSession = (sessionId: string, sessionLogs: any[]) => {
    const extractionLog = sessionLogs.find(l => l.task === 'fact-check-extraction');
    const verificationLogs = sessionLogs.filter(l => l.task === 'fact-check-verification');
    
    const totalCost = sessionLogs.reduce((sum, log) => sum + log.cost, 0);
    const totalTokens = sessionLogs.reduce((sum, log) => sum + log.inputTokens + log.outputTokens, 0);
    const claimsVerified = verificationLogs.reduce((sum, log) => sum + (log.claimsProcessed || 0), 0);
    const rating = sessionLogs[0]?.rating;

    return (
      <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 p-3 rounded mb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                Fact Check Session
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {new Date(sessionLogs[0].timestamp).toLocaleString()}
              </p>
            </div>
          </div>
          {rating && (
            <div className="flex items-center gap-1 text-yellow-500">
              {'⭐'.repeat(rating)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-800 p-2 rounded">
            <p className="text-xs text-gray-600 dark:text-gray-400">Claims Verified</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {claimsVerified}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-2 rounded">
            <p className="text-xs text-gray-600 dark:text-gray-400">Total Tokens</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {totalTokens.toLocaleString()}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-2 rounded">
            <p className="text-xs text-gray-600 dark:text-gray-400">Total Cost</p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              ${totalCost.toFixed(4)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-2 rounded">
            <p className="text-xs text-gray-600 dark:text-gray-400">Operations</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {sessionLogs.length}
            </p>
          </div>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline mb-2">
            View breakdown
          </summary>
          <div className="space-y-2 pl-4">
            {extractionLog && (
              <div className="flex items-center justify-between py-1 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300">
                  📊 Extraction ({extractionLog.model})
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">
                    {extractionLog.inputTokens + extractionLog.outputTokens} tokens
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-mono">
                    ${extractionLog.cost.toFixed(5)}
                  </span>
                </div>
              </div>
            )}
            {verificationLogs.map((log, idx) => (
              <div key={idx} className="flex items-center justify-between py-1 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300">
                  🔍 Verification #{idx + 1} ({log.model})
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">
                    {log.inputTokens + log.outputTokens} tokens
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-mono">
                    ${log.cost.toFixed(5)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {Object.entries(groupedLogs).map(([sessionId, sessionLogs]) => (
        <React.Fragment key={sessionId}>
          {renderFactCheckSession(sessionId, sessionLogs)}
        </React.Fragment>
      ))}
    </div>
  );
};

// Updated statistics calculation for your logs modal
export function calculateFactCheckStats(logs: any[]) {
  const factCheckLogs = logs.filter(log => log.task?.startsWith('fact-check'));
  
  if (factCheckLogs.length === 0) {
    return null;
  }

  // Group by session
  const sessions = factCheckLogs.reduce((acc, log) => {
    const sessionId = log.sessionId || log.timestamp;
    if (!acc[sessionId]) {
      acc[sessionId] = [];
    }
    acc[sessionId].push(log);
    return acc;
  }, {} as Record<string, any[]>);

  const sessionCount = Object.keys(sessions).length;
  const totalClaims = factCheckLogs
    .filter(l => l.task === 'fact-check-verification')
    .reduce((sum, log) => sum + (log.claimsProcessed || 0), 0);
  const totalCost = factCheckLogs.reduce((sum, log) => sum + log.cost, 0);
  const avgCostPerClaim = totalClaims > 0 ? totalCost / totalClaims : 0;

  const ratings = factCheckLogs
    .filter(l => l.rating)
    .map(l => l.rating);
  const avgRating = ratings.length > 0
    ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
    : 0;

  return {
    sessionCount,
    totalClaims,
    totalCost,
    avgCostPerClaim,
    avgRating,
    ratingCount: ratings.length,
  };
}

// Add this to your existing logs modal UI
export const FactCheckStatsCard: React.FC<{ logs: any[] }> = ({ logs }) => {
  const stats = calculateFactCheckStats(logs);

  if (!stats) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          Fact Checking Stats
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Sessions</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.sessionCount}
          </p>
        </div>
        
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Claims Verified</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.totalClaims}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Avg Cost/Claim</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            ${stats.avgCostPerClaim.toFixed(4)}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Avg Rating</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {stats.avgRating.toFixed(1)} ⭐
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Total spent on fact checking: 
          <span className="font-semibold text-green-600 dark:text-green-400 ml-1">
            ${stats.totalCost.toFixed(4)}
          </span>
        </p>
      </div>
    </div>
  );
};