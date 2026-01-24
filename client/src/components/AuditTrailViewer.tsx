/**
 * Audit Trail Viewer Component
 * 
 * Displays the audit log for a document showing all corrections and changes.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

import { useEffect, useState } from 'react';
import { invoiceAPI, type AuditLogEntry } from '../services/invoice.api';

interface AuditTrailViewerProps {
  documentId: string;
}

const AuditTrailViewer = ({ documentId }: AuditTrailViewerProps) => {
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAuditLog();
  }, [documentId]);

  const loadAuditLog = async () => {
    try {
      setLoading(true);
      const response = await invoiceAPI.getAuditLog(documentId);
      setAuditEntries(response.audit_entries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
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

  if (auditEntries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-rexcan-dark-blue-secondary">
          No audit entries found for this document.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-rexcan-dark-blue-primary mb-2">
          Audit Trail
        </h3>
        <p className="text-sm text-rexcan-dark-blue-secondary">
          Complete history of all changes made to this document.
        </p>
      </div>

      <div className="space-y-4">
        {auditEntries.map((entry, index) => (
          <div
            key={index}
            className="border-l-4 border-rexcan-dark-blue-primary pl-4 py-2"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-rexcan-dark-blue-primary">
                  {entry.action}
                </p>
                {entry.field_name && (
                  <p className="text-xs text-rexcan-dark-blue-secondary mt-1">
                    Field: <span className="font-medium">{entry.field_name}</span>
                  </p>
                )}
              </div>
              <p className="text-xs text-rexcan-dark-blue-secondary">
                {formatTimestamp(entry.timestamp)}
              </p>
            </div>

            {entry.old_value !== undefined && entry.new_value !== undefined && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-red-600 font-medium">Before:</span>
                  <span className="text-xs text-rexcan-dark-blue-secondary">
                    {String(entry.old_value)}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-green-600 font-medium">After:</span>
                  <span className="text-xs text-rexcan-dark-blue-secondary">
                    {String(entry.new_value)}
                  </span>
                </div>
              </div>
            )}

            {entry.user_id && (
              <p className="text-xs text-rexcan-dark-blue-secondary mt-1">
                User: {entry.user_id}
              </p>
            )}

            {entry.reason && (
              <p className="text-xs text-rexcan-dark-blue-secondary mt-1 italic">
                Reason: {entry.reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AuditTrailViewer;

