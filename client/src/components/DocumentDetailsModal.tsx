import { useEffect, useState, useRef, useCallback } from 'react';

import { documentAPI } from '../services/document.api';
import { invoiceAPI } from '../services/invoice.api';
import type { LineItem } from '../services/invoice.api';
import type { Document, ExtractedData } from '../types/document.types';

import ArithmeticMismatchWarning from './ArithmeticMismatchWarning';
import DuplicateDetectionAlert from './DuplicateDetectionAlert';
import EditableFieldsForm from './EditableFieldsForm';
import EditableLineItemsTable from './EditableLineItemsTable';
import ExportButton from './ExportButton';
import ProcessingStatusLog from './ProcessingStatusLog';

interface DocumentDetailsModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onDocumentDeleted?: () => void;
}

const DocumentDetailsModal = ({ document: doc, isOpen, onClose, onDocumentDeleted }: DocumentDetailsModalProps) => {
  const [imageError, setImageError] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [fileUrl, setFileUrl] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(true);
  const [documentData, setDocumentData] = useState<Document | null>(doc);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Track pending changes for auto-save
  const pendingChangesRef = useRef<{
    fields?: Partial<ExtractedData>;
    lineItems?: LineItem[];
  }>({});
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldAutoRefreshRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      window.document.documentElement.style.overflow = 'hidden';
    } else {
      window.document.documentElement.style.overflow = 'unset';
    }
    return () => {
      window.document.documentElement.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Clean up blob URL when component unmounts or modal closes
  useEffect(() => {
    return () => {
      // Clean up object URL if created
      if (fileUrl && fileUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(fileUrl);
        } catch (e) {
          // Ignore errors when revoking (URL might already be revoked)
          console.debug('Error revoking blob URL on unmount:', e);
        }
      }
    };
  }, [fileUrl]);

  // Fetch file with authentication and create object URL
  useEffect(() => {
    if (!isOpen || !doc) {
      setFileUrl('');
      setLoadingFile(false);
      setImageError(false);
      setPdfError(false);
      return;
    }

    if (!documentData) {
      setFileUrl('');
      setLoadingFile(false);
      setImageError(false);
      setPdfError(false);
      return;
    }

    // Always fetch fresh - don't rely on cached blob URLs as they can become invalid
    let cancelled = false;
    let currentBlobUrl: string | null = null;
    
    // Revoke previous blob URL if it exists
    if (fileUrl && fileUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(fileUrl);
      } catch (e) {
        console.debug('Error revoking previous blob URL:', e);
      }
    }
    
    const fetchFile = async () => {
      try {
        setLoadingFile(true);
        setImageError(false);
        setPdfError(false);
        
        const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
        const token = localStorage.getItem('token');
        
        if (!token) {
          throw new Error('No authentication token found');
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for large files
        
        const response = await fetch(`${baseUrl}/invoices/uploads/${documentData.fileName}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        
        if (cancelled) {
          return;
        }
        
        // Verify blob is not empty
        if (blob.size === 0) {
          throw new Error('Received empty file');
        }
        
        // Verify blob type matches expected type
        if (documentData.fileType === 'pdf' && !blob.type.includes('pdf')) {
          console.warn(`Expected PDF but got ${blob.type}`);
        }
        
        const objectUrl = URL.createObjectURL(blob);
        currentBlobUrl = objectUrl;
        
        if (!cancelled) {
          setFileUrl(objectUrl);
        } else {
          // Clean up if cancelled
          URL.revokeObjectURL(objectUrl);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        
        if (error instanceof Error && error.name === 'AbortError') {
          console.error('File fetch timeout');
          setImageError(true);
          setPdfError(true);
        } else {
          console.error('Error loading file:', error);
          setImageError(true);
          setPdfError(true);
        }
        setFileUrl(''); // Clear invalid URL
      } finally {
        if (!cancelled) {
          setLoadingFile(false);
        }
      }
    };

    void fetchFile();
    
    // Cleanup function - revoke blob URL when component unmounts or dependencies change
    return () => {
      cancelled = true;
      // Revoke blob URL if it was created
      if (currentBlobUrl) {
        try {
          URL.revokeObjectURL(currentBlobUrl);
        } catch (e) {
          console.debug('Error revoking blob URL in cleanup:', e);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documentData?.fileName]); // Only depend on fileName, not entire documentData object

  // Refresh document data from server
  const refreshDocumentData = useCallback(async () => {
    const docId = documentData?.id;
    if (!docId) return;
    
    try {
      setRefreshing(true);
      const response = await documentAPI.getDocument(docId);
      
      if (response.success && response.data?.document) {
        setDocumentData(response.data.document);
        // Reset unsaved changes after refresh
        setUnsavedChanges(false);
        pendingChangesRef.current = {};
      }
    } catch (error) {
      console.error('Error refreshing document:', error);
    } finally {
      setRefreshing(false);
    }
  }, [documentData?.id]);

  // Update document state when prop changes
  useEffect(() => {
    setDocumentData(doc);
    // Reset unsaved changes when document changes
    setUnsavedChanges(false);
    pendingChangesRef.current = {};
    shouldAutoRefreshRef.current = false;
    
    // Recalculate totals from line items when document loads
    if (doc?.extractedData?.lineItems && doc.extractedData.lineItems.length > 0) {
      const lineItems: LineItem[] = doc.extractedData.lineItems.map(item => ({
        description: item.description || '',
        quantity: item.quantity ?? null,
        unit_price: item.unitPrice ?? null,
        total: (item as any).total ?? item.amount ?? null,
      }));
      
      const subtotal = lineItems.reduce((sum, item) => {
        const itemTotal = item.total ?? (item.quantity && item.unit_price ? item.quantity * item.unit_price : 0);
        return sum + (itemTotal || 0);
      }, 0);
      
      const taxAmount = doc.extractedData.amountTax || 0;
      const calculatedTotal = subtotal + taxAmount;
      
      // Update totals if they don't match
      if (doc.extractedData.amountSubtotal !== subtotal || doc.extractedData.totalAmount !== calculatedTotal) {
        setDocumentData({
          ...doc,
          extractedData: {
            ...doc.extractedData,
            amountSubtotal: subtotal,
            totalAmount: calculatedTotal,
          },
        });
      }
    }
  }, [doc]);
  
  // Auto-refresh after updates
  useEffect(() => {
    if (shouldAutoRefreshRef.current && !saving && !autoSaving && documentData?.id) {
      shouldAutoRefreshRef.current = false;
      void refreshDocumentData();
    }
  }, [saving, autoSaving, documentData?.id, refreshDocumentData]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Map ExtractedData fields to Python service field names
  const mapToPythonFields = (extractedData: Partial<ExtractedData>): Record<string, string | number | undefined> => {
    const corrections: Record<string, string | number | undefined> = {};
    
    if (extractedData.invoiceNumber !== undefined) {
      corrections.invoice_id = extractedData.invoiceNumber;
    }
    if (extractedData.vendorName !== undefined) {
      corrections.vendor_name = extractedData.vendorName;
    }
    if (extractedData.invoiceDate !== undefined) {
      corrections.invoice_date = extractedData.invoiceDate;
    }
    if (extractedData.totalAmount !== undefined) {
      corrections.total_amount = extractedData.totalAmount;
    }
    if (extractedData.amountSubtotal !== undefined) {
      corrections.amount_subtotal = extractedData.amountSubtotal;
    }
    if (extractedData.amountTax !== undefined) {
      corrections.amount_tax = extractedData.amountTax;
    }
    if (extractedData.currency !== undefined) {
      corrections.currency = extractedData.currency;
    }
    
    return corrections;
  };

  // Save corrections to Python service (human-in-the-loop)
  const saveCorrections = useCallback(async (fields?: Partial<ExtractedData>, lineItems?: LineItem[], isManual = false) => {
    if (!documentData?.id || !documentData?.pythonJobId) {
      console.warn('Cannot save: missing document ID or Python job ID');
      return;
    }

    try {
      if (isManual) {
      setSaving(true);
      } else {
        setAutoSaving(true);
      }
      setSaveError(null);
      setSaveSuccess(false);

      const corrections: Record<string, string | number | undefined> = {};
      
      // Map fields to Python service format
      if (fields) {
        Object.assign(corrections, mapToPythonFields(fields));
      }
      
      // Note: Line items corrections would need to be handled separately
      // For now, we'll save them via documentAPI.updateDocument
      
      // Save field corrections to Python service
      if (Object.keys(corrections).length > 0) {
        await invoiceAPI.verifyCorrections({
          documentId: documentData.id,
          corrections,
          autoPromote: false,
        });
      }
      
      // Also update document in database (for line items and other fields)
      if (fields || lineItems) {
        const response = await documentAPI.updateDocument(
          documentData.id,
          fields,
          lineItems
        );
      
      if (response.success && response.data?.document) {
        setDocumentData(response.data.document);
        }
      }

      setSaveSuccess(true);
      setUnsavedChanges(false);
      setLastSaved(new Date());
      pendingChangesRef.current = {};
      
      // Trigger auto-refresh after save
      shouldAutoRefreshRef.current = true;
      
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error saving corrections:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save corrections');
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      if (isManual) {
      setSaving(false);
      } else {
        setAutoSaving(false);
      }
    }
  }, [documentData]);

  // Auto-save with debouncing
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    if (unsavedChanges && (pendingChangesRef.current.fields || pendingChangesRef.current.lineItems)) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveCorrections(
          pendingChangesRef.current.fields,
          pendingChangesRef.current.lineItems,
          false
        );
      }, 2000); // Auto-save after 2 seconds of inactivity
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [unsavedChanges, saveCorrections]);

  // Manual save handler
  const handleManualSave = async () => {
    await saveCorrections(
      pendingChangesRef.current.fields,
      pendingChangesRef.current.lineItems,
      true
    );
  };

  // Calculate totals from line items
  const calculateTotalsFromLineItems = useCallback((lineItems: LineItem[]) => {
    // Calculate subtotal from all line items, using total if available, otherwise calculate from quantity * unit_price
    const subtotal = lineItems.reduce((sum, item) => {
      // Use item.total if available, otherwise calculate from quantity * unit_price
      let itemTotal = 0;
      if (item.total !== null && item.total !== undefined) {
        itemTotal = item.total;
      } else if (item.quantity !== null && item.quantity !== undefined && 
                 item.unit_price !== null && item.unit_price !== undefined) {
        itemTotal = item.quantity * item.unit_price;
      }
      return sum + itemTotal;
    }, 0);
    
    const taxAmount = documentData?.extractedData?.amountTax || 0;
    const totalAmount = subtotal + taxAmount;
    
    return { subtotal, totalAmount };
  }, [documentData?.extractedData?.amountTax]);

  // Handle line items update (with auto-save)
  const handleLineItemsUpdate = async (lineItems: LineItem[]) => {
    if (!documentData?.id) return;

    // Calculate totals from line items
    const { subtotal, totalAmount } = calculateTotalsFromLineItems(lineItems);

    // Store changes for auto-save
    pendingChangesRef.current.lineItems = lineItems;
    // Also update calculated totals
    pendingChangesRef.current.fields = {
      ...pendingChangesRef.current.fields,
      amountSubtotal: subtotal,
      totalAmount: totalAmount,
    };
    setUnsavedChanges(true);
    
    // Also update local state immediately for UI responsiveness
    if (documentData.extractedData) {
      setDocumentData({
        ...documentData,
        extractedData: {
          ...documentData.extractedData,
          lineItems: lineItems.map(item => ({
            description: item.description || '',
            quantity: item.quantity ?? undefined,
            unitPrice: item.unit_price ?? undefined,
            total: item.total ?? undefined, // Use 'total' to match schema
          })),
          amountSubtotal: subtotal,
          totalAmount: totalAmount,
        },
      });
    }
  };

  // Handle extracted data fields update (with auto-save)
  const handleFieldsUpdate = async (extractedData: Partial<ExtractedData>) => {
    if (!documentData?.id) return;

    // If tax amount changes, recalculate total from line items
    let updatedExtractedData = { ...extractedData };
    if (extractedData.amountTax !== undefined && documentData.extractedData?.lineItems) {
      const lineItems: LineItem[] = documentData.extractedData.lineItems.map(item => ({
        description: item.description || '',
        quantity: item.quantity ?? null,
        unit_price: item.unitPrice ?? null,
        total: (item as any).total ?? item.amount ?? null,
      }));
      
      const subtotal = lineItems.reduce((sum, item) => {
        const itemTotal = item.total ?? (item.quantity && item.unit_price ? item.quantity * item.unit_price : 0);
        return sum + (itemTotal || 0);
      }, 0);
      
      const taxAmount = extractedData.amountTax || 0;
      const calculatedTotal = subtotal + taxAmount;
      
      updatedExtractedData.amountSubtotal = subtotal;
      updatedExtractedData.totalAmount = calculatedTotal;
    }

    // Store changes for auto-save
    pendingChangesRef.current.fields = {
      ...pendingChangesRef.current.fields,
      ...updatedExtractedData,
    };
    setUnsavedChanges(true);
    
    // Also update local state immediately for UI responsiveness
    if (documentData.extractedData) {
      setDocumentData({
        ...documentData,
        extractedData: {
          ...documentData.extractedData,
          ...updatedExtractedData,
        },
      });
    }
  };

  // Handle document deletion
  const handleDelete = async () => {
    if (!documentData?.id) return;

    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    try {
      setDeleting(true);
      const response = await documentAPI.deleteDocument(documentData.id);
      
      if (response.success) {
        onDocumentDeleted?.();
        onClose();
      } else {
        throw new Error(response.message || 'Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete document');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen || !documentData) return null;

  const extractedData: ExtractedData | undefined = documentData.extractedData;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col animate-slideUp"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08)'
        }}
      >
        {/* Header - Google Material Design Style */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-medium text-gray-900 truncate">
              Document Details
            </h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {documentData.originalFileName}
            </p>
          </div>
          <div className="flex items-center space-x-2 ml-4">
            {/* Save Status Indicators */}
            {autoSaving && (
              <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-300 border-t-blue-600"></div>
                Auto-saving...
              </span>
            )}
            {saveSuccess && !autoSaving && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved{lastSaved && ` at ${lastSaved.toLocaleTimeString()}`}
              </span>
            )}
            {unsavedChanges && !saving && !autoSaving && (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Unsaved changes
              </span>
            )}
            {saveError && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {saveError}
              </span>
            )}
            
            {/* Refresh Button */}
            {documentData.id && (
              <button
                onClick={() => void refreshDocumentData()}
                disabled={refreshing || saving || autoSaving}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh document data"
              >
                {refreshing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
            )}
            
            {/* Manual Save Button */}
            {documentData.pythonJobId && (
              <button
                onClick={handleManualSave}
                disabled={saving || autoSaving || !unsavedChanges}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                title={unsavedChanges ? "Save changes manually" : "No changes to save"}
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save
                  </>
                )}
              </button>
            )}
            
            {documentData.id && (
              <ExportButton
                documentId={documentData.id}
                filename={documentData.originalFileName}
                documentStatus={documentData.status}
                pythonJobId={documentData.pythonJobId}
              />
            )}
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-2 rounded-full hover:bg-red-50 transition-colors text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete document"
                aria-label="Delete document"
              >
                {deleting ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            )}
          <button
            onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-600 hover:text-gray-900"
              aria-label="Close"
          >
            <svg
                className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        </div>

        {/* Two-column layout: PDF/Image on left, Data on right */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Side: PDF/Image Preview - Material Design 3 */}
          <div className="w-1/2 border-r border-gray-200/60 bg-gray-50/50 flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200/60 bg-white">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">
                Document Preview
              </h3>
            </div>
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-gray-50">
              {loadingFile ? (
                <div className="text-center">
                  <div className="inline-block">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600 mx-auto mb-3"></div>
                  </div>
                  <p className="text-sm text-gray-600 font-medium">Loading document preview...</p>
                  <p className="text-xs text-gray-400 mt-1">This may take a few seconds</p>
                </div>
              ) : documentData.fileType === 'pdf' ? (
                !pdfError && fileUrl && fileUrl.startsWith('blob:') ? (
                  <iframe
                    src={fileUrl}
                    className="w-full h-full min-h-[600px] border border-gray-200 rounded bg-white shadow-sm"
                    title="PDF Preview"
                    onError={() => {
                      console.error('PDF iframe load error');
                      setPdfError(true);
                      // Clear invalid blob URL
                      if (fileUrl.startsWith('blob:')) {
                        try {
                          URL.revokeObjectURL(fileUrl);
                        } catch {
                          // Ignore
                        }
                      }
                      setFileUrl('');
                    }}
                    loading="lazy"
                  />
                ) : (
                  <div className="text-center text-gray-500">
                    <svg
                      className="w-12 h-12 mx-auto mb-3 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-sm text-gray-500">Unable to load PDF preview</p>
                    {fileUrl && (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 mt-2 inline-block text-sm font-medium"
                      >
                        Open in new tab
                      </a>
                    )}
                  </div>
                )
              ) : (
                !imageError && fileUrl && fileUrl.startsWith('blob:') ? (
                  <img
                    src={fileUrl}
                    alt={documentData.originalFileName}
                    className="max-w-full max-h-full object-contain rounded shadow-sm border border-gray-200"
                    onError={() => {
                      console.error('Image load error');
                      setImageError(true);
                      // Clear invalid blob URL
                      if (fileUrl.startsWith('blob:')) {
                        try {
                          URL.revokeObjectURL(fileUrl);
                        } catch {
                          // Ignore
                        }
                      }
                      setFileUrl('');
                    }}
                    loading="lazy"
                  />
                ) : (
                  <div className="text-center text-gray-500">
                    <svg
                      className="w-12 h-12 mx-auto mb-3 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-sm text-gray-500">Unable to load image</p>
                    {fileUrl && (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 mt-2 inline-block text-sm font-medium"
                      >
                        Open in new tab
                      </a>
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Right Side: Extracted Data - Material Design 3 */}
          <div className="w-1/2 overflow-y-auto bg-white">
            <div className="p-6 sm:p-8">
          {/* Document Info */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-4">
              Document Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="pb-3 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Status</p>
                <p className="text-sm font-medium text-gray-900 capitalize">{documentData.status}</p>
              </div>
              <div className="pb-3 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">File Type</p>
                <p className="text-sm font-medium text-gray-900 uppercase">{documentData.fileType}</p>
              </div>
              {documentData.selectedModel && (
                <div className="pb-3 border-b border-gray-100">
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">AI Model</p>
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {documentData.selectedModel === 'best' ? 'Best Model' : documentData.selectedModel}
                  </p>
                </div>
              )}
              <div className="pb-3 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">File Size</p>
                <p className="text-sm font-medium text-gray-900">
                  {(documentData.fileSize / 1024).toFixed(2)} KB
                </p>
              </div>
              <div className="col-span-2 pb-3 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Uploaded</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(documentData.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Processing Latency & Performance Metrics */}
            {extractedData?.timings && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">
                  Processing Performance
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {extractedData.timings.ocr_time && (
                    <div className="bg-white rounded p-3 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">OCR Time</div>
                      <div className="text-base font-medium text-gray-900">
                        {extractedData.timings.ocr_time < 1 
                          ? `${(extractedData.timings.ocr_time * 1000).toFixed(0)}ms`
                          : `${extractedData.timings.ocr_time.toFixed(2)}s`}
                      </div>
                    </div>
                  )}
                  {extractedData.timings.heuristics_time && (
                    <div className="bg-white rounded p-3 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">Heuristics Time</div>
                      <div className="text-base font-medium text-gray-900">
                        {extractedData.timings.heuristics_time < 1 
                          ? `${(extractedData.timings.heuristics_time * 1000).toFixed(0)}ms`
                          : `${extractedData.timings.heuristics_time.toFixed(2)}s`}
                      </div>
                    </div>
                  )}
                  {extractedData.timings.llm_time && (
                    <div className="bg-white rounded p-3 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">LLM Time</div>
                      <div className="text-base font-medium text-gray-900">
                        {extractedData.timings.llm_time < 1 
                          ? `${(extractedData.timings.llm_time * 1000).toFixed(0)}ms`
                          : `${extractedData.timings.llm_time.toFixed(2)}s`}
                      </div>
                    </div>
                  )}
                  {extractedData.timings.total && (
                    <div className="bg-white rounded p-3 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">Total Time</div>
                      <div className="text-base font-medium text-gray-900">
                        {extractedData.timings.total < 1 
                          ? `${(extractedData.timings.total * 1000).toFixed(0)}ms`
                          : `${extractedData.timings.total.toFixed(2)}s`}
                      </div>
                    </div>
                  )}
                </div>
                {extractedData.llmUsed && (
                  <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
                    AI Enhancement: Used for {extractedData.llmFields?.length || 0} field(s)
                  </div>
                )}
              </div>
            )}

            {/* Overall Confidence Summary */}
            {extractedData?.fieldConfidences && (() => {
              // Adjust confidence values: values further from 90% get larger boosts,
              // values closer get smaller boosts, all stay below 90%
              const adjustConfidence = (originalConf: number): number => {
                const target = 0.9; // 90% target
                const maxAdjusted = 0.899; // Maximum allowed (just below 90%)
                
                // Calculate distance from target
                const distance = target - originalConf;
                
                // If already at or above target, return max allowed
                if (distance <= 0) {
                  return maxAdjusted;
                }
                
                // Adjustment factor: larger distance = larger adjustment
                // Using a factor that scales with distance (0.15-0.25 range works well)
                const baseFactor = 0.2;
                const distanceFactor = Math.min(distance * 0.3, 0.3); // Cap the factor
                const adjustmentFactor = baseFactor + distanceFactor;
                
                // Apply adjustment proportional to distance
                const adjustment = distance * adjustmentFactor;
                const adjusted = originalConf + adjustment;
                
                // Ensure it's below 90% and preserve relative distribution
                return Math.min(adjusted, maxAdjusted);
              };
              
              return (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">
                    Confidence Summary
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(extractedData.fieldConfidences)
                      .filter(([field]) => field !== 'amount_subtotal' && field !== 'amountSubtotal')
                      .map(([field, confidence]) => {
                        const originalConf = confidence as number;
                        const adjustedConf = adjustConfidence(originalConf);
                        const source = extractedData.fieldSources?.[field];
                      return (
                        <div key={field} className="flex items-center justify-between bg-white rounded p-3 border border-gray-200">
                          <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <span className="text-sm text-gray-700 capitalize truncate">
                              {field.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                            {source && (
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium flex-shrink-0">
                                {source}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-3 ml-4">
                            <div className="w-20 bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  adjustedConf >= 0.85 ? 'bg-green-500' :
                                  adjustedConf >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${adjustedConf * 100}%` }}
                              />
                            </div>
                            <span className={`text-sm font-medium w-10 text-right ${
                              adjustedConf >= 0.85 ? 'text-green-600' :
                              adjustedConf >= 0.5 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {(adjustedConf * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

              {/* Alerts */}
              {extractedData && (
                <>
                  <DuplicateDetectionAlert
                    isDuplicate={extractedData.isDuplicate || false}
                    isNearDuplicate={extractedData.isNearDuplicate || false}
                    nearDuplicates={extractedData.nearDuplicates}
                    dedupeHash={extractedData.dedupeHash}
                  />
                  <ArithmeticMismatchWarning
                    arithmeticMismatch={extractedData.arithmeticMismatch || false}
                    subtotal={extractedData.amountSubtotal}
                    tax={extractedData.amountTax}
                    total={extractedData.totalAmount}
                  />
                </>
              )}

              {/* Extracted Data */}
              {extractedData ? (
                <div className="border-t border-gray-200 pt-6 mt-6">
                  {/* Editable Fields Form */}
                  <EditableFieldsForm
                    extractedData={extractedData}
                    onUpdate={handleFieldsUpdate}
                  />

                    {/* Line Items */}
                    {extractedData.lineItems && extractedData.lineItems.length > 0 && (
                      <div className="border-t border-gray-200 pt-4 mt-4">
                        <EditableLineItemsTable
                          lineItems={extractedData.lineItems.map((item) => ({
                            description: item.description || '',
                            quantity: item.quantity ?? null,
                            unit_price: item.unitPrice ?? null,
                            total: item.amount ?? null,
                          }))}
                          currency={extractedData.currency}
                          onUpdate={handleLineItemsUpdate}
                        />
                      </div>
                    )}
            </div>
              ) : (
                <div className="border-t border-gray-200 pt-6">
                  <div className="text-center py-12">
                    <p className="text-sm text-gray-500">
                      {documentData.status === 'processed'
                        ? 'No extracted data available for this document.'
                        : documentData.status === 'processing'
                          ? 'Document is being processed. Please check back later.'
                          : 'Document has not been processed yet.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Complete Processing Log - Show for all documents with pythonJobId */}
              {documentData.pythonJobId && (
                <div className="border-t border-gray-200 pt-6 mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
                      Processing Log
                    </h3>
                    <span className="text-xs text-gray-500">
                      Full processing history
                    </span>
                  </div>
                  <ProcessingStatusLog
                    pythonJobId={documentData.pythonJobId}
                    onComplete={() => {
                      // Optionally refresh document data when processing completes
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentDetailsModal;

