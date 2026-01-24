/**
 * Line Items Table Component
 * 
 * Displays invoice line items in a table format.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

import type { LineItem } from '../services/invoice.api';

interface LineItemsTableProps {
  lineItems: LineItem[];
  currency?: string | null;
}

const LineItemsTable = ({ lineItems, currency }: LineItemsTableProps) => {
  if (!lineItems || lineItems.length === 0) {
    return (
      <div className="text-center py-8 text-rexcan-dark-blue-secondary">
        <p>No line items found</p>
      </div>
    );
  }

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

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-rexcan-light-grey-secondary">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-rexcan-dark-blue-primary uppercase tracking-wider">
              Description
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-rexcan-dark-blue-primary uppercase tracking-wider">
              Quantity
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-rexcan-dark-blue-primary uppercase tracking-wider">
              Unit Price
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-rexcan-dark-blue-primary uppercase tracking-wider">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {lineItems.map((item, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-rexcan-dark-blue-primary">
                {item.description || 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-rexcan-dark-blue-secondary">
                {item.quantity !== null && item.quantity !== undefined
                  ? item.quantity.toFixed(2)
                  : 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-rexcan-dark-blue-secondary">
                {formatCurrency(item.unit_price)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-rexcan-dark-blue-primary">
                {formatCurrency(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LineItemsTable;

