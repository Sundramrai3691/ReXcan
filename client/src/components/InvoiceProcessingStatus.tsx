/**
 * Invoice Processing Status Component
 * 
 * Displays real-time processing status with progress indicators.
 * Following industry standards (Oct 2025) with proper UX patterns.
 */

import { useEffect, useState } from 'react';
import { invoiceAPI, type InvoiceExtract } from '../services/invoice.api';

interface InvoiceProcessingStatusProps {
  documentId: string;
  pythonJobId?: string;
  onComplete?: (result: InvoiceExtract) => void;
  onError?: (error: Error) => void;
}

type ProcessingStage = 'uploading' | 'ocr' | 'heuristics' | 'llm' | 'canonicalization' | 'validation' | 'complete' | 'error';

const InvoiceProcessingStatus = ({
  documentId,
  pythonJobId,
  onComplete,
  onError,
}: InvoiceProcessingStatusProps) => {
  const [stage, setStage] = useState<ProcessingStage>('uploading');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<InvoiceExtract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pythonJobId) return;

    const pollStatus = async () => {
      try {
        // Poll for processing completion
        const extract = await invoiceAPI.processInvoice(documentId);
        
        // Update progress based on timings
        if (extract.timings) {
          const totalTime = Object.values(extract.timings).reduce((a, b) => a + (b || 0), 0);
          const ocrTime = extract.timings.ocr_time || 0;
          const heuristicsTime = extract.timings.heuristics_time || 0;
          const llmTime = extract.timings.llm_time || 0;

          if (ocrTime > 0 && heuristicsTime === 0) {
            setStage('ocr');
            setProgress(20);
          } else if (heuristicsTime > 0 && llmTime === 0 && !extract.llm_used) {
            setStage('heuristics');
            setProgress(60);
          } else if (extract.llm_used) {
            setStage('llm');
            setProgress(80);
          } else {
            setStage('validation');
            setProgress(90);
          }
        }

        setResult(extract);
        setStage('complete');
        setProgress(100);
        onComplete?.(extract);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Processing failed';
        setError(errorMessage);
        setStage('error');
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      }
    };

    // Initial delay before polling
    const timeoutId = setTimeout(() => {
      pollStatus();
    }, 1000);

    // Poll every 2 seconds
    const intervalId = setInterval(pollStatus, 2000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [documentId, pythonJobId, onComplete, onError]);

  const stageLabels: Record<ProcessingStage, string> = {
    uploading: 'Uploading file...',
    ocr: 'Extracting text (OCR)...',
    heuristics: 'Extracting fields (Heuristics)...',
    llm: 'Enhancing with AI (LLM)...',
    canonicalization: 'Normalizing data...',
    validation: 'Validating results...',
    complete: 'Processing complete!',
    error: 'Processing failed',
  };

  const stageIcons: Record<ProcessingStage, string> = {
    uploading: '📤',
    ocr: '👁️',
    heuristics: '🔍',
    llm: '🤖',
    canonicalization: '📋',
    validation: '✅',
    complete: '✨',
    error: '❌',
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center space-x-4 mb-4">
        <div className="text-3xl">{stageIcons[stage]}</div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-rexcan-dark-blue-primary">
            {stageLabels[stage]}
          </h3>
          {error && (
            <p className="text-sm text-red-600 mt-1">{error}</p>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
        <div
          className="bg-gradient-to-r from-[#00FFD8] to-[#39FF14] h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stage Indicators */}
      <div className="flex justify-between text-xs text-rexcan-dark-blue-secondary">
        <span className={stage === 'ocr' ? 'text-[#00FFD8] font-semibold' : ''}>OCR</span>
        <span className={stage === 'heuristics' ? 'text-[#00FFD8] font-semibold' : ''}>Heuristics</span>
        <span className={stage === 'llm' ? 'text-[#00FFD8] font-semibold' : ''}>LLM</span>
        <span className={stage === 'validation' ? 'text-[#00FFD8] font-semibold' : ''}>Validation</span>
        <span className={stage === 'complete' ? 'text-[#00FFD8] font-semibold' : ''}>Complete</span>
      </div>

      {/* Result Summary */}
      {result && stage === 'complete' && (
        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="text-sm text-green-800">
            <strong>Processing Time:</strong> {result.timings?.total_time?.toFixed(2) || 'N/A'}s
          </p>
          {result.llm_used && (
            <p className="text-sm text-green-800 mt-1">
              <strong>AI Enhancement:</strong> Used for {result.llm_fields?.length || 0} field(s)
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default InvoiceProcessingStatus;

