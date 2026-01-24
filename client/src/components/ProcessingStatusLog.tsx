/**
 * Processing Status Log Component
 * 
 * Displays real-time processing logs with progress, latency, and confidence metrics.
 * Shows step-by-step progress of invoice processing.
 */

import { useEffect, useState, useRef } from 'react';
import { invoiceAPI } from '../services/invoice.api';

interface ProcessingStatusLogProps {
  pythonJobId: string;
  onComplete?: () => void;
  showHeader?: boolean; // Option to hide header for embedded use
  compact?: boolean; // Compact mode for smaller displays
}

interface LogEntry {
  timestamp: number;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

interface ProcessingMetrics {
  ocrTime?: number;
  heuristicsTime?: number;
  llmTime?: number;
  totalTime?: number;
  progress: number;
  currentStage: string;
}

const ProcessingStatusLog = ({ pythonJobId, onComplete, showHeader = true, compact = false }: ProcessingStatusLogProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<string>('processing');
  const [isComplete, setIsComplete] = useState(false);
  const [jobNotFound, setJobNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ProcessingMetrics>({
    progress: 0,
    currentStage: 'Initializing...',
  });
  const logEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const isCompleteRef = useRef(false);
  const jobNotFoundRef = useRef(false);

  useEffect(() => {
    if (!pythonJobId) return;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Reset state
    setJobNotFound(false);
    setError(null);
    setIsComplete(false);
    isCompleteRef.current = false;
    jobNotFoundRef.current = false;
    isPollingRef.current = false;

    const pollStatus = async (): Promise<{ complete: boolean; stopPolling: boolean }> => {
      // Prevent multiple simultaneous polls
      if (isPollingRef.current) {
        return { complete: false, stopPolling: false };
      }

      // Stop polling if already complete or job not found
      if (isCompleteRef.current || jobNotFoundRef.current) {
        return { complete: isCompleteRef.current, stopPolling: true };
      }

      isPollingRef.current = true;

      try {
        const response = await invoiceAPI.getJobStatus(pythonJobId);
        
        if (response.success && response.data) {
          const { logs: newLogs, status: newStatus, has_result } = response.data;
          
          setStatus(newStatus);
          setError(null);
          
          // Convert logs to LogEntry format
          const logEntries: LogEntry[] = (newLogs || []).map((log: any) => ({
            timestamp: log.timestamp || Date.now() / 1000,
            message: log.message || '',
            level: log.level || 'info',
          }));
          
          setLogs(logEntries);
          
          // Calculate progress and metrics from logs
          const progressMetrics = calculateProgress(logEntries, newStatus);
          setMetrics(progressMetrics);
          
          // Check if processing is complete
          const jobComplete = newStatus === 'processed' || has_result;
          if (jobComplete) {
            isCompleteRef.current = true;
            setIsComplete(true);
            onComplete?.();
            isPollingRef.current = false;
            return { complete: true, stopPolling: true };
          }
          
          isPollingRef.current = false;
          return { complete: false, stopPolling: false };
        } else {
          // Response was not successful - could be 404 or other error
          isPollingRef.current = false;
          const errorMessage = response.message || 'Job not found';
          const isNotFound = errorMessage.toLowerCase().includes('not found') || 
                            errorMessage.toLowerCase().includes('404');
          
          if (isNotFound) {
            jobNotFoundRef.current = true;
            setJobNotFound(true);
            setError('Job not found. The processing job may have expired or been cleared.');
            console.warn('Job not found, stopping polling:', pythonJobId);
            // Immediately clear interval if it exists
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return { complete: false, stopPolling: true };
          }
          
          return { complete: false, stopPolling: false };
        }
      } catch (error: any) {
        isPollingRef.current = false;
        
        // Check if it's a 404 (job not found) error
        // Axios errors have response.status, and error messages may contain status codes
        const statusCode = error?.response?.status || error?.status || error?.code;
        const errorMessage = error?.message || 
                            error?.response?.data?.message || 
                            error?.response?.data?.error ||
                            String(error);
        const isNotFound = statusCode === 404 || 
                          statusCode === '404' ||
                          errorMessage.toLowerCase().includes('404') || 
                          errorMessage.toLowerCase().includes('not found') ||
                          errorMessage.toLowerCase().includes('job not found');
        
        if (isNotFound) {
          jobNotFoundRef.current = true;
          setJobNotFound(true);
          setError('Job not found. The processing job may have expired or been cleared.');
          console.warn('Job not found (404), stopping polling:', pythonJobId);
          // Immediately clear interval if it exists
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return { complete: false, stopPolling: true };
        }
        
        // For other errors, log but continue polling (might be temporary)
        console.error('Error polling job status:', error);
        setError('Error retrieving job status. Retrying...');
        return { complete: false, stopPolling: false };
      }
    };

    // Poll immediately
    pollStatus().then(({ complete, stopPolling }) => {
      // If not complete and not stopped, continue polling every 2 seconds
      if (!complete && !stopPolling) {
        intervalRef.current = setInterval(async () => {
          // Check if already complete or job not found before polling
          if (isCompleteRef.current || jobNotFoundRef.current) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return;
          }
          
          const result = await pollStatus();
          if (result.complete || result.stopPolling) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }
        }, 2000);
      }
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isPollingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pythonJobId]); // Removed isComplete and onComplete from dependencies to prevent infinite loops

  // Calculate progress from logs
  const calculateProgress = (logEntries: LogEntry[], currentStatus: string): ProcessingMetrics => {
    let progress = 0;
    let currentStage = 'Initializing...';
    const metrics: ProcessingMetrics = {
      progress: 0,
      currentStage: 'Initializing...',
    };

    // Detect stages from log messages
    const hasStarted = logEntries.length > 0;
    const hasOcr = logEntries.some(log => 
      log.message.toLowerCase().includes('ocr') || 
      log.message.toLowerCase().includes('pdfplumber') ||
      log.message.toLowerCase().includes('tesseract') ||
      log.message.toLowerCase().includes('easyocr')
    );
    const hasHeuristics = logEntries.some(log => 
      log.message.toLowerCase().includes('heuristic') ||
      log.message.toLowerCase().includes('extraction completed')
    );
    const hasLlm = logEntries.some(log => 
      log.message.toLowerCase().includes('llm') ||
      log.message.toLowerCase().includes('calling llm')
    );
    const hasCompleted = currentStatus === 'processed' || logEntries.some(log => 
      log.message.toLowerCase().includes('completed successfully')
    );

    // Extract timing information from logs
    const ocrLog = logEntries.find(log => log.message.includes('OCR completed'));
    const heuristicsLog = logEntries.find(log => log.message.includes('Heuristic extraction completed'));
    const llmLog = logEntries.find(log => log.message.includes('LLM extraction completed'));

    if (ocrLog) {
      const match = ocrLog.message.match(/(\d+\.\d+)s/);
      if (match) metrics.ocrTime = parseFloat(match[1]);
    }
    if (heuristicsLog) {
      const match = heuristicsLog.message.match(/(\d+\.\d+)s/);
      if (match) metrics.heuristicsTime = parseFloat(match[1]);
    }
    if (llmLog) {
      const match = llmLog.message.match(/(\d+\.\d+)s/);
      if (match) metrics.llmTime = parseFloat(match[1]);
    }

    // Calculate progress percentage
    if (hasCompleted) {
      progress = 100;
      currentStage = 'Complete';
    } else if (hasLlm) {
      progress = 85;
      currentStage = 'AI Enhancement';
    } else if (hasHeuristics) {
      progress = 60;
      currentStage = 'Field Extraction';
    } else if (hasOcr) {
      progress = 30;
      currentStage = 'Text Extraction';
    } else if (hasStarted) {
      progress = 10;
      currentStage = 'Processing';
    }

    metrics.progress = progress;
    metrics.currentStage = currentStage;

    // Calculate total time if we have all components
    if (metrics.ocrTime && metrics.heuristicsTime) {
      metrics.totalTime = (metrics.ocrTime || 0) + (metrics.heuristicsTime || 0) + (metrics.llmTime || 0);
    }

    return metrics;
  };

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogIcon = (level: string): string => {
    switch (level) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      default:
        return '→';
    }
  };

  const getLogColor = (level: string): string => {
    switch (level) {
      case 'success':
        return 'text-green-700';
      case 'error':
        return 'text-red-700';
      case 'warning':
        return 'text-yellow-700';
      default:
        return 'text-gray-700';
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
    });
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    return `${seconds.toFixed(2)}s`;
  };

  return (
    <div className={`bg-white rounded-lg ${compact ? 'p-4' : 'p-6'} border border-gray-200 shadow-sm`}>
      {/* Header with Progress */}
      {showHeader && (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              isComplete ? 'bg-green-500' : 'bg-blue-500 animate-pulse'
            }`}></div>
            <span className="text-sm font-medium text-gray-900">
              {isComplete ? 'Processing Complete' : metrics.currentStage}
            </span>
          </div>
          <span className="text-xs text-gray-500 font-mono">
            {pythonJobId.slice(0, 8)}...
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Progress</span>
            <span className="text-sm font-medium text-gray-900">{metrics.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${metrics.progress}%` }}
            />
          </div>
        </div>

        {/* Latency Metrics */}
        {(metrics.ocrTime || metrics.heuristicsTime || metrics.llmTime) && (
          <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            {metrics.ocrTime && (
              <div>
                <div className="text-xs text-gray-500 mb-1">OCR</div>
                <div className="text-sm font-medium text-gray-900">{formatDuration(metrics.ocrTime)}</div>
              </div>
            )}
            {metrics.heuristicsTime && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Heuristics</div>
                <div className="text-sm font-medium text-gray-900">{formatDuration(metrics.heuristicsTime)}</div>
              </div>
            )}
            {metrics.llmTime && (
              <div>
                <div className="text-xs text-gray-500 mb-1">LLM</div>
                <div className="text-sm font-medium text-gray-900">{formatDuration(metrics.llmTime)}</div>
              </div>
            )}
            {metrics.totalTime && (
              <div className="col-span-3 pt-2 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Total Time</span>
                  <span className="text-sm font-medium text-gray-900">{formatDuration(metrics.totalTime)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Error Message */}
      {jobNotFound && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">Job Not Found</p>
              <p className="text-xs text-yellow-700 mt-1">
                {error || 'The processing job may have expired or been cleared from the system.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && !jobNotFound && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Logs Container */}
      <div className={`${compact ? 'max-h-64' : 'max-h-96'} overflow-y-auto space-y-0.5 bg-gray-50 rounded border border-gray-200 p-3`}>
        {logs.length === 0 && !jobNotFound ? (
          <div className="text-gray-400 text-sm text-center py-8">
            {isComplete ? 'No logs available' : 'Waiting for processing to start...'}
          </div>
        ) : jobNotFound ? (
          <div className="text-gray-400 text-sm text-center py-8">
            No logs available - Job not found in system
          </div>
        ) : (
          <>
            <div className="mb-3 pb-2 border-b border-gray-200">
              <div className="text-xs text-gray-500 font-medium">
                Processing Log ({logs.length} entries)
              </div>
            </div>
            <div className="space-y-0.5">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`flex items-start space-x-3 ${getLogColor(log.level)} hover:bg-white rounded px-3 py-2 transition-colors group`}
                >
                  <span className="text-gray-400 text-xs w-16 flex-shrink-0 font-mono">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className="w-4 flex-shrink-0 text-sm flex items-center justify-center mt-0.5">{getLogIcon(log.level)}</span>
                  <span className="flex-1 break-words text-sm leading-relaxed text-gray-700">{log.message}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div ref={logEndRef} />
      </div>

      {/* Status Footer */}
      {isComplete && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-green-600 font-medium">
              ✓ Processing completed successfully
            </div>
            {metrics.totalTime && (
              <div className="text-xs text-gray-500">
                Total: {formatDuration(metrics.totalTime)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingStatusLog;
