/**
 * Arithmetic Mismatch Warning Component
 * 
 * Displays warnings when subtotal + tax ≠ total.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

interface ArithmeticMismatchWarningProps {
  arithmeticMismatch: boolean;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
}

const ArithmeticMismatchWarning = ({
  arithmeticMismatch,
  subtotal,
  tax,
  total,
}: ArithmeticMismatchWarningProps) => {
  if (!arithmeticMismatch) {
    return null;
  }

  const calculatedTotal = (subtotal || 0) + (tax || 0);
  const difference = Math.abs((total || 0) - calculatedTotal);

  return (
    <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-orange-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-orange-800">
            Arithmetic Mismatch Detected
          </h3>
          <div className="mt-2 text-sm text-orange-700">
            <p>
              The calculated total (Subtotal + Tax) does not match the extracted total amount.
            </p>
            <div className="mt-2 space-y-1 text-xs">
              <p>
                <strong>Subtotal:</strong> ${(subtotal || 0).toFixed(2)}
              </p>
              <p>
                <strong>Tax:</strong> ${(tax || 0).toFixed(2)}
              </p>
              <p>
                <strong>Calculated Total:</strong> ${calculatedTotal.toFixed(2)}
              </p>
              <p>
                <strong>Extracted Total:</strong> ${(total || 0).toFixed(2)}
              </p>
              <p className="font-semibold">
                <strong>Difference:</strong> ${difference.toFixed(2)}
              </p>
            </div>
            <p className="mt-2 text-xs text-orange-600">
              Please review and correct the values manually if needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArithmeticMismatchWarning;

