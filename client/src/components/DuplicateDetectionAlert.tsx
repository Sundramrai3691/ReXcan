/**
 * Duplicate Detection Alert Component
 * 
 * Displays alerts for duplicate and near-duplicate invoices.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

interface DuplicateDetectionAlertProps {
  isDuplicate: boolean;
  isNearDuplicate: boolean;
  nearDuplicates?: Array<{ job_id: string; similarity: number }>;
  dedupeHash?: string | null;
}

const DuplicateDetectionAlert = ({
  isDuplicate,
  isNearDuplicate,
  nearDuplicates,
  dedupeHash,
}: DuplicateDetectionAlertProps) => {
  if (!isDuplicate && !isNearDuplicate) {
    return null;
  }

  return (
    <div className="space-y-3">
      {isDuplicate && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">
                Duplicate Invoice Detected
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  This invoice appears to be an exact duplicate of a previously processed invoice.
                </p>
                {dedupeHash && (
                  <p className="mt-1 text-xs font-mono text-red-600">
                    Hash: {dedupeHash.substring(0, 16)}...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isNearDuplicate && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                Near-Duplicate Invoice Detected
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  This invoice is similar to {nearDuplicates?.length || 0} previously processed
                  invoice(s).
                </p>
                {nearDuplicates && nearDuplicates.length > 0 && (
                  <ul className="mt-2 list-disc list-inside space-y-1">
                    {nearDuplicates.map((dup, index) => (
                      <li key={index} className="text-xs">
                        Job ID: {dup.job_id} (Similarity: {(dup.similarity * 100).toFixed(1)}%)
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DuplicateDetectionAlert;

