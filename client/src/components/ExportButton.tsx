/**
 * Export Button Component
 * 
 * Provides CSV and JSON export functionality with ERP format selection for CSV.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

import { useState } from 'react';
import { documentAPI } from '../services/document.api';

interface ExportButtonProps {
  documentId: string;
  filename?: string;
  disabled?: boolean;
  documentStatus?: string;
  pythonJobId?: string;
}

const ERP_FORMATS = [
  { value: 'quickbooks', label: 'QuickBooks' },
  { value: 'sap', label: 'SAP' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'xero', label: 'Xero' },
  { value: 'default', label: 'Default (CSV)' },
];

/**
 * Sanitize filename for download by removing file extensions and special characters
 */
const sanitizeFilename = (filename: string): string => {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  // Remove or replace special characters that might cause issues in filenames
  return nameWithoutExt
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'document';
};

const ExportButton = ({
  documentId,
  filename = 'invoice',
  disabled = false,
  documentStatus,
  pythonJobId,
}: ExportButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('quickbooks');

  // Determine if export should be disabled based on document status
  const isProcessed = documentStatus === 'processed' && pythonJobId;
  const isDisabled = disabled || !isProcessed || isExporting;
  
  // Sanitize filename for downloads
  const sanitizedFilename = sanitizeFilename(filename);

  const handleCSVExport = async (erpType: string = 'quickbooks') => {
    if (isDisabled) return;

    try {
      setIsExporting(true);
      const blob = await documentAPI.exportCSV(documentId, erpType, false);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedFilename}_${erpType}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV export failed:', error);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(false);
      setShowMenu(false);
    }
  };

  const handleJSONExport = async () => {
    if (isDisabled) return;

    try {
      setIsExporting(true);
      const blob = await documentAPI.exportJSON(documentId);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedFilename}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('JSON export failed:', error);
      alert('Failed to export JSON. Please try again.');
    } finally {
      setIsExporting(false);
      setShowMenu(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isDisabled}
        title={!isProcessed ? 'Document must be processed before exporting' : undefined}
        className={`
          inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md
          text-white bg-rexcan-dark-blue-primary hover:bg-rexcan-dark-blue-secondary
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00FFD8]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
        `}
      >
        {isExporting ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <svg
              className="-ml-1 mr-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export
            <svg
              className="-mr-1 ml-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </>
        )}
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
            <div className="py-1">
              {/* JSON Export */}
              <button
                onClick={handleJSONExport}
                className="block w-full text-left px-4 py-2 text-sm text-rexcan-dark-blue-secondary hover:bg-gray-100 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Export as JSON
              </button>
              
              {/* Divider */}
              <div className="border-t border-gray-200 my-1"></div>
              
              {/* CSV Export Header */}
              <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Export as CSV
              </div>
              
              {/* ERP Format Options */}
              {ERP_FORMATS.map((format) => (
                <button
                  key={format.value}
                  onClick={() => handleCSVExport(format.value)}
                  className={`
                    block w-full text-left px-4 py-2 text-sm
                    ${
                      selectedFormat === format.value
                        ? 'bg-rexcan-light-grey-secondary text-rexcan-dark-blue-primary'
                        : 'text-rexcan-dark-blue-secondary hover:bg-gray-100'
                    }
                  `}
                >
                  {format.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ExportButton;

