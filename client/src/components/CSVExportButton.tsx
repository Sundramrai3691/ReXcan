/**
 * CSV Export Button Component
 * 
 * Provides CSV export functionality with ERP format selection.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

import { useState } from 'react';
import { invoiceAPI } from '../services/invoice.api';

interface CSVExportButtonProps {
  documentId: string;
  filename?: string;
  disabled?: boolean;
}

const ERP_FORMATS = [
  { value: 'quickbooks', label: 'QuickBooks' },
  { value: 'sap', label: 'SAP' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'xero', label: 'Xero' },
  { value: 'default', label: 'Default (CSV)' },
];

const CSVExportButton = ({
  documentId,
  filename = 'invoice',
  disabled = false,
}: CSVExportButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('quickbooks');

  const handleExport = async (erpType: string = 'quickbooks') => {
    if (disabled || isExporting) return;

    try {
      setIsExporting(true);
      const blob = await invoiceAPI.exportCSV(documentId, erpType, false);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}_${erpType}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(false);
      setShowFormatMenu(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowFormatMenu(!showFormatMenu)}
        disabled={disabled || isExporting}
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
            Export CSV
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

      {showFormatMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowFormatMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
            <div className="py-1">
              {ERP_FORMATS.map((format) => (
                <button
                  key={format.value}
                  onClick={() => handleExport(format.value)}
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

export default CSVExportButton;

