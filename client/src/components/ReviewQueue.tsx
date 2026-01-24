/**
 * Review Queue Component
 * 
 * Displays flagged invoices that need manual review.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

import { useEffect, useState } from 'react';
import { invoiceAPI, type ReviewQueueItem } from '../services/invoice.api';
import { useNavigate } from 'react-router-dom';

const ReviewQueue = () => {
  const [queueItems, setQueueItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadReviewQueue();
  }, []);

  const loadReviewQueue = async () => {
    try {
      setLoading(true);
      const response = await invoiceAPI.getReviewQueue(50);
      setQueueItems(response.flagged_invoices);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (conf: number): string => {
    if (conf >= 0.85) return 'text-green-600';
    if (conf >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00FFD8]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (queueItems.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-rexcan-dark-blue-secondary text-lg">
          No invoices require review at this time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-rexcan-dark-blue-primary">
          Review Queue ({queueItems.length})
        </h2>
        <button
          onClick={loadReviewQueue}
          className="px-4 py-2 text-sm font-medium text-rexcan-dark-blue-primary bg-white border border-rexcan-dark-blue-secondary rounded-md hover:bg-rexcan-light-grey-secondary"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-4">
        {queueItems.map((item) => (
          <div
            key={item.job_id}
            className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-400 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <h3 className="text-lg font-semibold text-rexcan-dark-blue-primary">
                    {item.filename}
                  </h3>
                  {item.is_duplicate && (
                    <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                      Duplicate
                    </span>
                  )}
                  {item.arithmetic_mismatch && (
                    <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded">
                      Arithmetic Mismatch
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  {item.invoice_id && (
                    <div>
                      <p className="text-xs text-rexcan-dark-blue-secondary">Invoice ID</p>
                      <p className="font-medium">{item.invoice_id}</p>
                    </div>
                  )}
                  {item.vendor_name && (
                    <div>
                      <p className="text-xs text-rexcan-dark-blue-secondary">Vendor</p>
                      <p className="font-medium">{item.vendor_name}</p>
                    </div>
                  )}
                  {item.total_amount !== null && item.total_amount !== undefined && (
                    <div>
                      <p className="text-xs text-rexcan-dark-blue-secondary">Total Amount</p>
                      <p className="font-medium">${item.total_amount.toFixed(2)}</p>
                    </div>
                  )}
                </div>

                {item.low_confidence_fields.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-rexcan-dark-blue-secondary mb-2">
                      Low Confidence Fields:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.low_confidence_fields.map((field) => (
                        <span
                          key={field}
                          className={`px-2 py-1 text-xs rounded ${
                            getConfidenceColor(item.field_confidences[field] || 0)
                          } bg-opacity-10`}
                        >
                          {field} ({(item.field_confidences[field] * 100).toFixed(0)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => navigate(`/review/${item.job_id}`)}
                className="ml-4 px-4 py-2 text-sm font-medium text-white bg-rexcan-dark-blue-primary rounded-md hover:bg-rexcan-dark-blue-secondary transition-colors"
              >
                Review
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReviewQueue;

