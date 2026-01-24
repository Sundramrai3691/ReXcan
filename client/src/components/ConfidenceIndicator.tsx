/**
 * Confidence Indicator Component
 * 
 * Displays confidence scores and field source badges for extracted fields.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

interface ConfidenceIndicatorProps {
  confidence: number;
  source?: string;
  fieldName: string;
  showBadge?: boolean;
}

const ConfidenceIndicator = ({
  confidence,
  source,
  fieldName,
  showBadge = true,
}: ConfidenceIndicatorProps) => {
  const getConfidenceColor = (conf: number): string => {
    if (conf >= 0.85) return 'text-green-700 bg-green-50 border-green-200';
    if (conf >= 0.5) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  const getConfidenceLabel = (conf: number): string => {
    if (conf >= 0.85) return 'High';
    if (conf >= 0.5) return 'Medium';
    return 'Low';
  };

  const getSourceBadgeColor = (src?: string): string => {
    const sourceColors: Record<string, string> = {
      pdfplumber: 'bg-blue-50 text-blue-700 border border-blue-200',
      easyocr: 'bg-purple-50 text-purple-700 border border-purple-200',
      tesseract: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
      docai: 'bg-green-50 text-green-700 border border-green-200',
      heuristic: 'bg-orange-50 text-orange-700 border border-orange-200',
      llm: 'bg-pink-50 text-pink-700 border border-pink-200',
    };
    return sourceColors[src || ''] || 'bg-gray-50 text-gray-700 border border-gray-200';
  };

  const formatSource = (src?: string): string => {
    if (!src) return 'Unknown';
    return src.charAt(0).toUpperCase() + src.slice(1);
  };

  return (
    <div className="flex items-center space-x-1.5">
      <div
        className={`px-2 py-0.5 rounded text-xs font-medium border ${getConfidenceColor(
          confidence
        )}`}
        title={`${fieldName}: ${(confidence * 100).toFixed(0)}% confidence`}
      >
        {getConfidenceLabel(confidence)} ({(confidence * 100).toFixed(0)}%)
      </div>
      {showBadge && source && (
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${getSourceBadgeColor(source)}`}
          title={`Source: ${formatSource(source)}`}
        >
          {formatSource(source)}
        </span>
      )}
    </div>
  );
};

export default ConfidenceIndicator;

