/**
 * Editable Line Items Table Component
 * 
 * Provides CRUD operations for invoice line items.
 */

import { useState, useEffect } from 'react';

import type { LineItem } from '../services/invoice.api';

interface EditableLineItemsTableProps {
  lineItems: LineItem[];
  currency?: string | null;
  onUpdate: (items: LineItem[]) => void;
}

const EditableLineItemsTable = ({ lineItems, currency, onUpdate }: EditableLineItemsTableProps) => {
  // Normalize line items: default quantity to 1 if unit_price exists but quantity is missing
  const normalizedLineItems = (lineItems || []).map(item => {
    // If unit_price exists but quantity is null/undefined, default quantity to 1
    if ((item.unit_price !== null && item.unit_price !== undefined) && 
        (item.quantity === null || item.quantity === undefined)) {
      return {
        ...item,
        quantity: 1,
        total: item.total ?? (item.unit_price * 1), // Calculate total if missing
      };
    }
    // If quantity and unit_price exist but total is missing, calculate it
    if ((item.quantity !== null && item.quantity !== undefined) &&
        (item.unit_price !== null && item.unit_price !== undefined) &&
        (item.total === null || item.total === undefined)) {
      return {
        ...item,
        total: item.quantity * item.unit_price,
      };
    }
    return item;
  });
  
  const [items, setItems] = useState<LineItem[]>(normalizedLineItems);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<LineItem | null>(null);
  
  // Update items when lineItems prop changes
  useEffect(() => {
    const normalized = (lineItems || []).map(item => {
      if ((item.unit_price !== null && item.unit_price !== undefined) && 
          (item.quantity === null || item.quantity === undefined)) {
        return {
          ...item,
          quantity: 1,
          total: item.total ?? (item.unit_price * 1),
        };
      }
      if ((item.quantity !== null && item.quantity !== undefined) &&
          (item.unit_price !== null && item.unit_price !== undefined) &&
          (item.total === null || item.total === undefined)) {
        return {
          ...item,
          total: item.quantity * item.unit_price,
        };
      }
      return item;
    });
    setItems(normalized);
  }, [lineItems]);

  const formatCurrency = (amount: number | null | undefined): string => {
    if (amount === null || amount === undefined) return 'N/A';
    const currencySymbol = 
      currency === 'USD' ? '$' : 
      currency === 'EUR' ? '€' : 
      currency === 'GBP' ? '£' : 
      currency === 'INR' ? '₹' : 
      currency || '$';
    return `${currencySymbol}${amount.toFixed(2)}`;
  };

  const calculateTotal = (quantity: number | null | undefined, unitPrice: number | null | undefined): number | null => {
    if (quantity === null || quantity === undefined || unitPrice === null || unitPrice === undefined) {
      return null;
    }
    return quantity * unitPrice;
  };

  const handleAdd = () => {
    const newItem: LineItem = {
      description: '',
      quantity: 1, // Default quantity is 1
      unit_price: null,
      total: null,
    };
    setItems([...items, newItem]);
    setEditingIndex(items.length);
    setEditingItem({ ...newItem });
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditingItem({ ...items[index] });
  };

  const handleSave = () => {
    if (editingIndex === null || !editingItem) return;

    const updatedItems = [...items];
    const itemToSave: LineItem = { ...editingItem };
    
    // Default quantity to 1 if unit_price exists but quantity is missing
    if ((itemToSave.unit_price !== null && itemToSave.unit_price !== undefined) &&
        (itemToSave.quantity === null || itemToSave.quantity === undefined)) {
      itemToSave.quantity = 1;
    }
    
    // Calculate total if quantity and unit_price are provided
    if (itemToSave.quantity !== null && itemToSave.quantity !== undefined &&
        itemToSave.unit_price !== null && itemToSave.unit_price !== undefined) {
      itemToSave.total = calculateTotal(itemToSave.quantity, itemToSave.unit_price);
    } else {
      // Ensure total is null if calculation can't be done
      itemToSave.total = itemToSave.total ?? null;
    }
    
    updatedItems[editingIndex] = itemToSave;
    setItems(updatedItems);
    setEditingIndex(null);
    setEditingItem(null);
    // Trigger update immediately for auto-save
    onUpdate(updatedItems);
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setEditingItem(null);
  };

  const handleDelete = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);
    onUpdate(updatedItems);
  };

  const handleFieldChange = (field: keyof LineItem, value: string | number | null) => {
    if (!editingItem) return;
    const updatedItem: LineItem = {
      ...editingItem,
      [field]: value === '' ? null : value,
    };
    
    // Auto-update total when quantity or unit_price changes
    if (field === 'quantity' || field === 'unit_price') {
      // Default quantity to 1 if unit_price exists but quantity is missing
      const effectiveQuantity = updatedItem.quantity ?? 
        (updatedItem.unit_price !== null && updatedItem.unit_price !== undefined ? 1 : null);
      
      if (effectiveQuantity !== null && effectiveQuantity !== undefined &&
          updatedItem.unit_price !== null && updatedItem.unit_price !== undefined) {
        updatedItem.total = calculateTotal(effectiveQuantity, updatedItem.unit_price);
        // Also update quantity if it was defaulted
        if (updatedItem.quantity === null || updatedItem.quantity === undefined) {
          updatedItem.quantity = 1;
        }
      } else {
        // Clear total if quantity or unit_price is missing
        updatedItem.total = null;
      }
    }
    
    setEditingItem(updatedItem);
  };

  if (items.length === 0 && editingIndex === null) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500 mb-4">No line items found</p>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Add Line Item
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-gray-700">Line Items</h4>
        {editingIndex === null && (
          <button
            onClick={handleAdd}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Quantity
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Unit Price
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Total
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                {editingIndex === index ? (
                  <>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editingItem?.description || ''}
                        onChange={(e) => handleFieldChange('description', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Description"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={editingItem?.quantity ?? ''}
                        onChange={(e) => handleFieldChange('quantity', e.target.value ? parseFloat(e.target.value) : null)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={editingItem?.unit_price ?? ''}
                        onChange={(e) => handleFieldChange('unit_price', e.target.value ? parseFloat(e.target.value) : null)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {editingItem && editingItem.total !== null && editingItem.total !== undefined
                        ? formatCurrency(editingItem.total)
                        : editingItem && calculateTotal(editingItem.quantity, editingItem.unit_price) !== null
                        ? formatCurrency(calculateTotal(editingItem.quantity, editingItem.unit_price))
                        : 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={handleSave}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Save"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={handleCancel}
                          className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                          title="Cancel"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {item.description || 'N/A'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                      {(() => {
                        // Default to 1 if unit_price exists but quantity is missing
                        const displayQuantity = item.quantity ?? 
                          (item.unit_price !== null && item.unit_price !== undefined ? 1 : null);
                        return displayQuantity !== null && displayQuantity !== undefined
                          ? displayQuantity.toFixed(2)
                          : 'N/A';
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {(() => {
                        // Calculate total: use saved total, or calculate from quantity × unit_price
                        // Default quantity to 1 if unit_price exists
                        const effectiveQuantity = item.quantity ?? 
                          (item.unit_price !== null && item.unit_price !== undefined ? 1 : null);
                        const effectiveUnitPrice = item.unit_price;
                        
                        if (item.total !== null && item.total !== undefined) {
                          return formatCurrency(item.total);
                        } else if (effectiveQuantity !== null && effectiveQuantity !== undefined &&
                                   effectiveUnitPrice !== null && effectiveUnitPrice !== undefined) {
                          return formatCurrency(effectiveQuantity * effectiveUnitPrice);
                        }
                        return 'N/A';
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(index)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(index)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EditableLineItemsTable;

