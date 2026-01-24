/**
 * Editable Fields Form Component
 * 
 * Provides CRUD operations for extracted invoice fields.
 */

import { useState, useEffect } from 'react';
import type { ExtractedData } from '../types/document.types';

interface EditableFieldsFormProps {
  extractedData: ExtractedData;
  onUpdate: (data: Partial<ExtractedData>) => void;
}

const EditableFieldsForm = ({ extractedData, onUpdate }: EditableFieldsFormProps) => {
  const [formData, setFormData] = useState<Partial<ExtractedData>>(extractedData);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setFormData(extractedData);
  }, [extractedData]);

  const handleFieldChange = (field: keyof ExtractedData, value: string | number | undefined) => {
    const updatedData = {
      ...formData,
      [field]: value === '' ? undefined : value,
    };
    setFormData(updatedData);
    // Call onUpdate immediately for auto-save tracking
    if (isEditing) {
      onUpdate(updatedData);
    }
  };

  const handleTaxInfoChange = (field: 'taxRate' | 'taxAmount', value: number | undefined) => {
    const updatedData = {
      ...formData,
      taxInformation: {
        ...formData.taxInformation,
        [field]: value === undefined || value === null ? undefined : value,
      },
    };
    setFormData(updatedData);
    // Call onUpdate immediately for auto-save tracking
    if (isEditing) {
      onUpdate(updatedData);
    }
  };

  const handleSave = () => {
    onUpdate(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData(extractedData);
    setIsEditing(false);
  };

  const formatCurrency = (amount: number | undefined, currency: string | undefined): string => {
    if (amount === undefined || amount === null) return '';
    const currencySymbol = 
      currency === 'USD' ? '$' : 
      currency === 'EUR' ? '€' : 
      currency === 'GBP' ? '£' : 
      currency === 'INR' ? '₹' : 
      currency || '$';
    return `${currencySymbol}${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format for input
    } catch {
      return dateString;
    }
  };

  const parseCurrency = (value: string): number | undefined => {
    if (!value) return undefined;
    // Remove currency symbols and parse
    const cleaned = value.replace(/[$€£]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : parsed;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
          Extracted Invoice Data
        </h3>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Fields
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Invoice Number */}
        <div className="pb-4 border-b border-gray-100">
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
            Invoice Number
          </label>
          {isEditing ? (
            <input
              type="text"
              value={formData.invoiceNumber || ''}
              onChange={(e) => handleFieldChange('invoiceNumber', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter invoice number"
            />
          ) : (
            <p className="text-base font-medium text-gray-900">
              {formData.invoiceNumber || 'N/A'}
            </p>
          )}
        </div>

        {/* Vendor Name */}
        <div className="pb-4 border-b border-gray-100">
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
            Vendor Name
          </label>
          {isEditing ? (
            <input
              type="text"
              value={formData.vendorName || ''}
              onChange={(e) => handleFieldChange('vendorName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter vendor name"
            />
          ) : (
            <p className="text-base font-medium text-gray-900">
              {formData.vendorName || 'N/A'}
            </p>
          )}
        </div>

        {/* Invoice Date */}
        <div className="pb-4 border-b border-gray-100">
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
            Invoice Date
          </label>
          {isEditing ? (
            <input
              type="date"
              value={formatDate(formData.invoiceDate)}
              onChange={(e) => handleFieldChange('invoiceDate', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="text-base font-medium text-gray-900">
              {formData.invoiceDate ? new Date(formData.invoiceDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }) : 'N/A'}
            </p>
          )}
        </div>


        {/* Currency */}
        <div className="pb-4 border-b border-gray-100">
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
            Currency
          </label>
          {isEditing ? (
            <select
              value={formData.currency || ''}
              onChange={(e) => handleFieldChange('currency', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select currency</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="INR">INR (₹)</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
              <option value="JPY">JPY</option>
            </select>
          ) : (
            <p className="text-base font-medium text-gray-900">
              {formData.currency || 'N/A'}
            </p>
          )}
        </div>

        {/* Total Amount */}
        <div className="pb-4 border-b border-gray-100">
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
            Total Amount
          </label>
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              value={formData.totalAmount ?? ''}
              onChange={(e) => handleFieldChange('totalAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          ) : (
            <p className="text-lg font-medium text-gray-900">
              {formatCurrency(formData.totalAmount, formData.currency) || 'N/A'}
            </p>
          )}
        </div>

        {/* Subtotal */}
        <div className="pb-4 border-b border-gray-100">
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
            Subtotal
          </label>
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              value={formData.amountSubtotal ?? ''}
              onChange={(e) => handleFieldChange('amountSubtotal', e.target.value ? parseFloat(e.target.value) : undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          ) : (
            <p className="text-base font-medium text-gray-900">
              {formatCurrency(formData.amountSubtotal, formData.currency) || 'N/A'}
            </p>
          )}
        </div>

        {/* Tax Amount */}
        <div className="pb-4 border-b border-gray-100">
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
            Tax Amount
          </label>
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              value={formData.amountTax ?? ''}
              onChange={(e) => handleFieldChange('amountTax', e.target.value ? parseFloat(e.target.value) : undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          ) : (
            <p className="text-base font-medium text-gray-900">
              {formatCurrency(formData.amountTax, formData.currency) || 'N/A'}
            </p>
          )}
        </div>

      </div>

      {/* Tax Information */}
      {formData.taxInformation && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">
            Tax Information
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="pb-3 border-b border-gray-100">
              <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
                Tax Rate (%)
              </label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={formData.taxInformation?.taxRate ?? ''}
                  onChange={(e) => handleTaxInfoChange('taxRate', e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              ) : (
                <p className="text-base font-medium text-gray-900">
                  {formData.taxInformation?.taxRate !== undefined
                    ? `${formData.taxInformation.taxRate}%`
                    : 'N/A'}
                </p>
              )}
            </div>
            <div className="pb-3 border-b border-gray-100">
              <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
                Tax Amount
              </label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={formData.taxInformation?.taxAmount ?? ''}
                  onChange={(e) => handleTaxInfoChange('taxAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              ) : (
                <p className="text-base font-medium text-gray-900">
                  {formatCurrency(formData.taxInformation?.taxAmount, formData.currency) || 'N/A'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditableFieldsForm;

