/**
 * Manual Correction Interface Component (HITL)
 * 
 * Allows users to manually correct extracted invoice fields.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

import { useState, useEffect } from 'react';
import { invoiceAPI, type InvoiceExtract } from '../services/invoice.api';
import ConfidenceIndicator from './ConfidenceIndicator';

interface ManualCorrectionInterfaceProps {
  documentId: string;
  invoiceData: InvoiceExtract;
  onSave?: (correctedData: InvoiceExtract) => void;
  onCancel?: () => void;
}

const ManualCorrectionInterface = ({
  documentId,
  invoiceData,
  onSave,
  onCancel,
}: ManualCorrectionInterfaceProps) => {
  const [corrections, setCorrections] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [autoPromote, setAutoPromote] = useState(false);

  const handleFieldChange = (field: string, value: any) => {
    setCorrections((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    if (Object.keys(corrections).length === 0) {
      alert('No corrections made');
      return;
    }

    try {
      setSaving(true);
      const response = await invoiceAPI.verifyCorrections({
        documentId,
        corrections,
        autoPromote,
      });
      onSave?.(response.result);
    } catch (error) {
      console.error('Failed to save corrections:', error);
      alert('Failed to save corrections. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'invoice_id', label: 'Invoice ID', type: 'text' },
    { key: 'vendor_name', label: 'Vendor Name', type: 'text' },
    { key: 'invoice_date', label: 'Invoice Date', type: 'date' },
    { key: 'total_amount', label: 'Total Amount', type: 'number', step: '0.01' },
    { key: 'amount_subtotal', label: 'Subtotal', type: 'number', step: '0.01' },
    { key: 'amount_tax', label: 'Tax Amount', type: 'number', step: '0.01' },
    { key: 'currency', label: 'Currency', type: 'text' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-rexcan-dark-blue-primary mb-2">
          Manual Corrections
        </h3>
        <p className="text-sm text-rexcan-dark-blue-secondary">
          Review and correct the extracted invoice fields below.
        </p>
      </div>

      <div className="space-y-4">
        {fields.map((field) => {
          const currentValue = corrections[field.key] ?? invoiceData[field.key as keyof InvoiceExtract];
          const confidence = invoiceData.field_confidences?.[field.key] || 0;
          const source = invoiceData.field_sources?.[field.key];

          return (
            <div key={field.key} className="border-b border-gray-200 pb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-rexcan-dark-blue-primary">
                  {field.label}
                </label>
                <ConfidenceIndicator
                  confidence={confidence}
                  source={source}
                  fieldName={field.key}
                />
              </div>
              <input
                type={field.type}
                step={field.step}
                value={currentValue || ''}
                onChange={(e) => {
                  const value = field.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                  handleFieldChange(field.key, value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00FFD8]"
                placeholder={`Enter ${field.label.toLowerCase()}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center space-x-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={autoPromote}
            onChange={(e) => setAutoPromote(e.target.checked)}
            className="mr-2"
          />
          <span className="text-sm text-rexcan-dark-blue-secondary">
            Auto-promote vendor (learn from corrections)
          </span>
        </label>
      </div>

      <div className="mt-6 flex justify-end space-x-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-rexcan-dark-blue-secondary bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || Object.keys(corrections).length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-rexcan-dark-blue-primary rounded-md hover:bg-rexcan-dark-blue-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Corrections'}
        </button>
      </div>
    </div>
  );
};

export default ManualCorrectionInterface;

