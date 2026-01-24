import { useState, useEffect, useRef } from 'react';
import { documentAPI } from '@/services/document.api';

interface BatchProcessingStatusProps {
  batchId: string;
  onComplete?: () => void;
  refreshInterval?: number;
}

interface BatchStatus {
  batchId: string;
  total: number;
  completed: number;
  inProgress: number;
  progress: number;
  statusCounts: {
    uploaded: number;
    queued: number;
    processing: number;
    processed: number;
    failed: number;
  };
  documents: Array<{
    id: string;
    fileName: string;
    originalFileName: string;
    status: string;
    pythonJobId?: string;
    createdAt: string;
    processedAt?: string;
  }>;
}

const BatchProcessingStatus = ({
  batchId,
  onComplete,
  refreshInterval = 3000,
}: BatchProcessingStatusProps) => {
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCompleteRef = useRef(false);

  const fetchBatchStatus = async () => {
    // Don't fetch if already complete
    if (isCompleteRef.current) {
      return;
    }

    try {
      const response = await documentAPI.getBatchStatus(batchId);
      if (response.success && response.data) {
        const newBatchStatus = response.data;
        setBatchStatus(newBatchStatus);
        setError(null);

        // Check if batch is complete and stop polling
        if (newBatchStatus.completed === newBatchStatus.total) {
          isCompleteRef.current = true;
          // Clear interval if batch is complete
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (onComplete) {
            onComplete();
          }
        }
      } else {
        setError(response.message || 'Failed to fetch batch status');
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch batch status';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset completion state when batchId changes
    isCompleteRef.current = false;
    
    // Fetch immediately
    fetchBatchStatus();

    // Set up polling
    intervalRef.current = setInterval(() => {
      fetchBatchStatus();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, refreshInterval]); // Removed batchStatus from dependencies to prevent interval recreation

  if (loading) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#00FFD8]"></div>
          <p className="text-gray-600">Loading batch status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800 flex items-center">
          <svg
            className="w-5 h-5 mr-2"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      </div>
    );
  }

  if (!batchStatus) {
    return null;
  }

  const isComplete = batchStatus.completed === batchStatus.total;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Batch Processing Status</h3>
        <span className="text-xs text-gray-500">Batch ID: {batchId.slice(0, 8)}...</span>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm text-gray-600">
            {batchStatus.completed} / {batchStatus.total} completed
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isComplete ? 'bg-green-500' : 'bg-[#00FFD8]'
            }`}
            style={{ width: `${batchStatus.progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">{batchStatus.progress}% complete</p>
      </div>

      {/* Status Counts */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        <div className="text-center p-2 bg-blue-50 rounded">
          <div className="text-2xl font-bold text-blue-700">
            {batchStatus.statusCounts.uploaded}
          </div>
          <div className="text-xs text-blue-600">Uploaded</div>
        </div>
        <div className="text-center p-2 bg-yellow-50 rounded">
          <div className="text-2xl font-bold text-yellow-700">
            {batchStatus.statusCounts.queued}
          </div>
          <div className="text-xs text-yellow-600">Queued</div>
        </div>
        <div className="text-center p-2 bg-orange-50 rounded">
          <div className="text-2xl font-bold text-orange-700">
            {batchStatus.statusCounts.processing}
          </div>
          <div className="text-xs text-orange-600">Processing</div>
        </div>
        <div className="text-center p-2 bg-green-50 rounded">
          <div className="text-2xl font-bold text-green-700">
            {batchStatus.statusCounts.processed}
          </div>
          <div className="text-xs text-green-600">Processed</div>
        </div>
        <div className="text-center p-2 bg-red-50 rounded">
          <div className="text-2xl font-bold text-red-700">
            {batchStatus.statusCounts.failed}
          </div>
          <div className="text-xs text-red-600">Failed</div>
        </div>
      </div>

      {/* Documents List */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Documents</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {batchStatus.documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 truncate">{doc.originalFileName}</p>
                <p className="text-xs text-gray-500">
                  {new Date(doc.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="ml-4">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    doc.status === 'processed'
                      ? 'bg-green-100 text-green-800'
                      : doc.status === 'failed'
                      ? 'bg-red-100 text-red-800'
                      : doc.status === 'processing'
                      ? 'bg-orange-100 text-orange-800'
                      : doc.status === 'queued'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {doc.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Completion Message */}
      {isComplete && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 flex items-center text-sm">
            <svg
              className="w-5 h-5 mr-2"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Batch processing completed!
          </p>
        </div>
      )}
    </div>
  );
};

export default BatchProcessingStatus;

