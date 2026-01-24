import { useState, useEffect } from 'react';

import { documentAPI } from '../services/document.api';
import type { Document, ExtractedData } from '../types/document.types';

interface DocumentsListProps {
  refreshTrigger?: number;
  onDocumentSelect?: (document: Document) => void;
  onDocumentDeleted?: () => void;
}

const DocumentsList = ({ refreshTrigger, onDocumentSelect, onDocumentDeleted }: DocumentsListProps) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [exportingJSON, setExportingJSON] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [timeFrom, setTimeFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [timeTo, setTimeTo] = useState<string>('');
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    skip: 0,
    hasMore: false,
  });

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await documentAPI.getDocuments(pagination.limit, pagination.skip);
      
      if (response.success && response.data) {
        setDocuments(response.data.documents);
        setPagination(response.data.pagination);
      } else {
        setError(response.message || 'Failed to fetch documents');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch documents';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocuments();
    // Clear selections when documents refresh
    setSelectedDocuments(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const getStatusColor = (status: Document['status']) => {
    switch (status) {
      case 'processed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'processing':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'queued':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get missing critical fields for a document
  const getMissingCriticalFields = (document: Document): string[] => {
    const missing: string[] = [];
    const extractedData = document.extractedData;
    
    if (!extractedData) {
      return ['Invoice ID', 'Date', 'Vendor Name', 'Total Amount'];
    }
    
    if (extractedData.missingInvoiceId || !extractedData.invoiceNumber) {
      missing.push('Invoice ID');
    }
    if (extractedData.missingDate || !extractedData.invoiceDate) {
      missing.push('Date');
    }
    if (extractedData.missingVendorName || !extractedData.vendorName) {
      missing.push('Vendor Name');
    }
    if (extractedData.missingTotal || !extractedData.totalAmount) {
      missing.push('Total Amount');
    }
    
    return missing;
  };

  // Filter documents based on date range
  const getFilteredDocuments = (): Document[] => {
    if (!dateFrom && !dateTo) {
      return documents;
    }

    return documents.filter((doc) => {
      const docDate = new Date(doc.createdAt);
      
      // Build from date/time
      let fromDate: Date | null = null;
      if (dateFrom) {
        const fromDateTime = timeFrom 
          ? `${dateFrom}T${timeFrom}` 
          : `${dateFrom}T00:00:00`;
        fromDate = new Date(fromDateTime);
      }
      
      // Build to date/time
      let toDate: Date | null = null;
      if (dateTo) {
        const toDateTime = timeTo 
          ? `${dateTo}T${timeTo}` 
          : `${dateTo}T23:59:59`;
        toDate = new Date(toDateTime);
      }
      
      // Check if document is within range
      if (fromDate && docDate < fromDate) {
        return false;
      }
      if (toDate && docDate > toDate) {
        return false;
      }
      
      return true;
    });
  };

  const filteredDocuments = getFilteredDocuments();


  const handleToggleSelect = (documentId: string, event: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation(); // Prevent triggering document select
    setSelectedDocuments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const filtered = getFilteredDocuments();
    const allFilteredSelected = filtered.length > 0 && 
      filtered.every((doc) => doc.id && selectedDocuments.has(doc.id));
    
    if (allFilteredSelected) {
      // Deselect all filtered documents
      setSelectedDocuments((prev) => {
        const newSet = new Set(prev);
        filtered.forEach((doc) => {
          if (doc.id) newSet.delete(doc.id);
        });
        return newSet;
      });
    } else {
      // Select all filtered documents
      setSelectedDocuments((prev) => {
        const newSet = new Set(prev);
        filtered.forEach((doc) => {
          if (doc.id) newSet.add(doc.id);
        });
        return newSet;
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDocuments.size === 0) return;

    if (!showBulkDeleteConfirm) {
      setShowBulkDeleteConfirm(true);
      return;
    }

    try {
      setBulkDeleting(true);
      // Only delete selected documents that are in the filtered list
      const selectedIds = filteredDocuments
        .filter((doc) => doc.id && selectedDocuments.has(doc.id))
        .map((doc) => doc.id!);
      
      if (selectedIds.length === 0) {
        setShowBulkDeleteConfirm(false);
        return;
      }
      
      const documentIds = selectedIds;
      
      // Delete all selected documents
      const deletePromises = documentIds.map((id) => documentAPI.deleteDocument(id));
      const results = await Promise.allSettled(deletePromises);

      // Count successes and failures
      let successCount = 0;
      let failureCount = 0;
      const failedIds: string[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failureCount++;
          failedIds.push(documentIds[index]);
        }
      });

      // Remove successfully deleted documents from list
      const successfulIds = documentIds.filter((id) => !failedIds.includes(id));
      setDocuments((prev) => prev.filter((doc) => !successfulIds.includes(doc.id)));
      setPagination((prev) => ({ ...prev, total: prev.total - successCount }));
      
      // Clear selections
      setSelectedDocuments(new Set());
      setShowBulkDeleteConfirm(false);

      // Show result message
      if (failureCount > 0) {
        alert(`Deleted ${successCount} document(s) successfully. ${failureCount} document(s) failed to delete.`);
      } else {
        onDocumentDeleted?.();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete documents';
      alert(errorMessage);
      setShowBulkDeleteConfirm(false);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkExportJSON = async () => {
    if (selectedDocuments.size === 0) return;

    try {
      setExportingJSON(true);
      
      // Get all selected documents that are processed (from filtered documents)
      const selectedDocs = filteredDocuments.filter(
        (doc) => doc.id && selectedDocuments.has(doc.id) && doc.status === 'processed' && doc.pythonJobId
      );

      if (selectedDocs.length === 0) {
        alert('No processed documents selected. Please select documents that have been processed.');
        return;
      }

      // Export each document and combine the data
      const exportPromises = selectedDocs.map(async (doc) => {
        try {
          const blob = await documentAPI.exportJSON(doc.id!);
          
          // Check if blob is actually an error response
          if (blob.size === 0) {
            console.error(`Empty response for document ${doc.id}`);
            return { error: 'Empty response', docId: doc.id, filename: doc.originalFileName };
          }
          
          const text = await blob.text();
          
          // Check if response is JSON error
          try {
            const parsed = JSON.parse(text);
            // If it's an error response object
            if (parsed.error || parsed.message) {
              console.error(`Error response for document ${doc.id}:`, parsed);
              return { error: parsed.error || parsed.message, docId: doc.id, filename: doc.originalFileName };
            }
            return { data: parsed, docId: doc.id, filename: doc.originalFileName };
          } catch {
            // If it's not JSON, it might be an error message
            if (text.includes('error') || text.includes('Error') || text.includes('failed')) {
              console.error(`Error in response for document ${doc.id}:`, text);
              return { error: text, docId: doc.id, filename: doc.originalFileName };
            }
            // Try to parse as JSON anyway
            return { data: JSON.parse(text), docId: doc.id, filename: doc.originalFileName };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Failed to export document ${doc.id} (${doc.originalFileName}):`, errorMessage);
          return { error: errorMessage, docId: doc.id, filename: doc.originalFileName };
        }
      });

      const results = await Promise.all(exportPromises);
      const validResults = results.filter((r) => r && r.data);
      const errorResults = results.filter((r) => r && r.error);

      if (validResults.length === 0) {
        const errorDetails = errorResults.map(r => `${r.filename}: ${r.error}`).join('\n');
        alert(`Failed to export any documents.\n\nErrors:\n${errorDetails || 'Unknown error'}\n\nPlease check the console for more details.`);
        return;
      }

      if (errorResults.length > 0) {
        const errorDetails = errorResults.map(r => `${r.filename}: ${r.error}`).join('\n');
        console.warn(`Some documents failed to export:\n${errorDetails}`);
      }

      // Combine into a single JSON array
      const combinedData = {
        exported_at: new Date().toISOString(),
        total_documents: validResults.length,
        failed_documents: errorResults.length,
        documents: validResults.map(r => r.data),
      };

      // Create and download the file
      const jsonBlob = new Blob([JSON.stringify(combinedData, null, 2)], {
        type: 'application/json',
      });
      const url = window.URL.createObjectURL(jsonBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documents_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export documents';
      alert(errorMessage);
    } finally {
      setExportingJSON(false);
    }
  };

  const handleBulkExportCSV = async () => {
    if (selectedDocuments.size === 0) return;

    try {
      setExportingCSV(true);
      
      // Get all selected documents that are processed (from filtered documents)
      const selectedDocs = filteredDocuments.filter(
        (doc) => doc.id && selectedDocuments.has(doc.id) && doc.status === 'processed' && doc.pythonJobId
      );

      if (selectedDocs.length === 0) {
        alert('No processed documents selected. Please select documents that have been processed.');
        return;
      }

      // Fetch full document data to get latest saved data from database
      const documentDataPromises = selectedDocs.map(async (doc) => {
        try {
          const response = await documentAPI.getDocument(doc.id!);
          if (response.success && response.data?.document) {
            return { doc: response.data.document, error: null };
          }
          return { doc, error: 'Failed to fetch document data' };
        } catch (error) {
          return { doc, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });

      const documentDataResults = await Promise.all(documentDataPromises);
      const validDocs = documentDataResults.filter(r => !r.error).map(r => r.doc);
      const errorDocs = documentDataResults.filter(r => r.error);

      if (validDocs.length === 0) {
        const errorDetails = errorDocs.map(r => `${r.doc.originalFileName}: ${r.error}`).join('\n');
        alert(`Failed to fetch document data.\n\nErrors:\n${errorDetails || 'Unknown error'}`);
        return;
      }

      // Convert documents to CSV format (user-facing, clean data)
      const csvRows: string[] = [];
      
      // Header row - user-facing fields
      const headers = [
        'Document Name',
        'Invoice ID',
        'Vendor Name',
        'Vendor ID',
        'Invoice Date',
        'Due Date',
        'Subtotal',
        'Tax',
        'Total Amount',
        'Currency'
      ];
      csvRows.push(headers.join(','));

      // Data rows - one row per document (no line items)
      validDocs.forEach((doc) => {
        const extractedData = doc.extractedData;
        const row = [
          `"${doc.originalFileName}"`,
          extractedData?.invoiceNumber || '',
          extractedData?.vendorName || '',
          (extractedData as ExtractedData & { vendorId?: string })?.vendorId || '',
          extractedData?.invoiceDate || '',
          extractedData?.amountSubtotal?.toString() || '',
          extractedData?.amountTax?.toString() || '',
          extractedData?.totalAmount?.toString() || '',
          extractedData?.currency || '',
        ];
        csvRows.push(row.join(','));
      });

      // Create combined CSV
      const finalCSV = csvRows.join('\n');

      // Create and download the file
      const csvBlob = new Blob([finalCSV], { type: 'text/csv' });
      const url = window.URL.createObjectURL(csvBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documents_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      if (errorDocs.length > 0) {
        const errorDetails = errorDocs.map(r => `${r.doc.originalFileName}: ${r.error}`).join('\n');
        console.warn(`Some documents failed to export:\n${errorDetails}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export documents';
      alert(errorMessage);
    } finally {
      setExportingCSV(false);
    }
  };

  const getFileIcon = (fileType: Document['fileType']) => {
    if (fileType === 'pdf') {
      return (
        <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      );
    }
    return (
      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  };

  if (loading && documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-gray-200 rounded-full"></div>
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
        </div>
        <p className="mt-4 text-sm text-gray-600">Loading documents...</p>
      </div>
    );
  }

  if (error && documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-base font-medium text-gray-900 mb-1">Unable to load documents</p>
        <p className="text-sm text-gray-500 mb-6 text-center max-w-sm">{error}</p>
        <button
          onClick={() => void fetchDocuments()}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm hover:shadow-md"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-base font-medium text-gray-900 mb-1">No documents yet</p>
        <p className="text-sm text-gray-500 text-center max-w-sm">
          Upload your first document to get started with processing
        </p>
      </div>
    );
  }

  const selectedCount = filteredDocuments.filter((doc) => 
    doc.id && selectedDocuments.has(doc.id)
  ).length;
  const allSelected = filteredDocuments.length > 0 && selectedCount === filteredDocuments.length;
  const someSelected = selectedCount > 0 && selectedCount < filteredDocuments.length;

  return (
    <div className="space-y-6">
      {/* Header Section - Material Design 3 */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-normal text-gray-900 tracking-tight mb-1">
              Documents
            </h2>
            <p className="text-sm text-gray-500">
              {filteredDocuments.length} of {pagination.total} {pagination.total === 1 ? 'document' : 'documents'}
              {filteredDocuments.length !== pagination.total && ' (filtered)'}
            </p>
          </div>
        </div>
        
        {/* Date Range Filter - Material Design 3 */}
        <div className="flex flex-col sm:flex-row gap-4 p-5 bg-gray-50/50 rounded-xl border border-gray-200/60">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-2">
              From Date & Time
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all hover:border-gray-400"
              />
              <input
                type="time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                className="px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!dateFrom}
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-2">
              To Date & Time
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all hover:border-gray-400"
              />
              <input
                type="time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                className="px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!dateTo}
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setDateFrom('');
                setTimeFrom('');
                setDateTo('');
                setTimeTo('');
                setSelectedDocuments(new Set());
              }}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-all shadow-sm hover:shadow"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
      
      {/* Action Panel - Material Design 3 */}
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            {selectedCount > 0 && (
              <>
                <span className="text-sm font-medium text-gray-700 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                  {selectedCount} {selectedCount === 1 ? 'selected' : 'selected'}
                </span>
                
                {/* Export Buttons */}
                <button
                  onClick={handleBulkExportJSON}
                  disabled={exportingJSON || exportingCSV || selectedCount === 0}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
                  title="Export selected documents as JSON"
                >
                  {exportingJSON ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                  Export JSON
                </button>
                
                <button
                  onClick={handleBulkExportCSV}
                  disabled={exportingJSON || exportingCSV || selectedCount === 0}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
                  title="Export selected documents as CSV"
                >
                  {exportingCSV ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  Export CSV
                </button>
              </>
            )}
            
            {/* Delete Button */}
            {showBulkDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg transition-colors shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {bulkDeleting ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Deleting...
                    </span>
                  ) : (
                    `Delete ${selectedCount}`
                  )}
                </button>
                <button
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  disabled={bulkDeleting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 active:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting || selectedCount === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
                title={selectedCount === 0 ? 'Select documents to delete' : `Delete ${selectedCount} selected document(s)`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}
          </div>
        <button
          onClick={() => void fetchDocuments()}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors ml-auto"
            title="Refresh"
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
        </button>
      </div>

      {/* Select All Button - Material Design Style */}
      {filteredDocuments.length > 0 && (
        <div className="flex items-center px-1 py-2 border-b border-gray-200">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-3 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors -ml-3"
          >
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someSelected;
                }}
                onChange={handleSelectAll}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <span>
              {allSelected ? 'Deselect all' : 'Select all'}
            </span>
          </button>
        </div>
      )}

      <div className="space-y-2">
        {filteredDocuments.map((document, index) => {
          const isSelected = document.id && selectedDocuments.has(document.id);
          const missingFields = document.status === 'processed' ? getMissingCriticalFields(document) : [];
          return (
          <div
            key={document.id || `doc-${index}`}
            onClick={() => onDocumentSelect?.(document)}
            className={`
                bg-white rounded-lg border transition-all duration-200
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50 shadow-md' 
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                }
              ${onDocumentSelect ? 'cursor-pointer' : ''}
                ${isSelected ? 'ring-2 ring-blue-200' : ''}
              `}
            >
              <div className="p-4">
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <div
                    onClick={(e) => handleToggleSelect(document.id!, e)}
                    className="flex-shrink-0 mt-0.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected || false}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(document.id!, e);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </div>

                  {/* File Icon */}
                  <div className="flex-shrink-0">
                    <div className={`
                      w-12 h-12 rounded-lg flex items-center justify-center
                      ${document.fileType === 'pdf' 
                        ? 'bg-red-50' 
                        : 'bg-blue-50'
                      }
                    `}>
                  {getFileIcon(document.fileType)}
                </div>
                  </div>

                  {/* Document Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-medium text-gray-900 truncate">
                            {document.originalFileName}
                          </h3>
                          {/* Missing Critical Fields Warning */}
                          {missingFields.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-shrink-0" title={`Missing: ${missingFields.join(', ')}`}>
                              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                {missingFields.length} missing
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Missing Fields Details */}
                        {missingFields.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            {missingFields.map((field) => (
                              <span
                                key={field}
                                className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                {field}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                            {formatFileSize(document.fileSize)}
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="uppercase font-medium">{document.fileType}</span>
                          <span className="text-gray-300">•</span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {formatDate(document.createdAt)}
                          </span>
                </div>
              </div>

                      {/* Status Badge */}
                      <div className="flex-shrink-0">
                <span
                  className={`
                            inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border
                    ${getStatusColor(document.status)}
                  `}
                >
                  {document.status}
                </span>
              </div>
            </div>
                  </div>
                </div>

                {/* Error Message */}
            {document.errorMessage && (
                  <div className="mt-4 pt-4 border-t border-red-200 flex items-start gap-2">
                    <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700">{document.errorMessage}</p>
              </div>
            )}
          </div>
            </div>
          );
        })}
      </div>

      {pagination.hasMore && (
        <div className="flex justify-center pt-6">
          <button
            onClick={() => {
              setPagination((prev) => ({ ...prev, skip: prev.skip + prev.limit }));
              void fetchDocuments();
            }}
            className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm hover:shadow"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
};

export default DocumentsList;

