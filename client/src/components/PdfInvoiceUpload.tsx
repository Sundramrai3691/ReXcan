import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import axios from 'axios';

import ManualCorrectionInterface from './ManualCorrectionInterface';
import { invoiceAPI, type InvoiceExtract, type UploadedInvoiceStatusValue } from '../services/invoice.api';

const MAX_UPLOAD_MB = 10;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

type UploadPhase = 'idle' | 'uploading' | UploadedInvoiceStatusValue;

const getUploadErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: string } | undefined)?.detail;
    return detail || error.message || 'Upload failed';
  }
  return error instanceof Error ? error.message : 'Upload failed';
};

const PdfInvoiceUpload = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState<InvoiceExtract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearPollTimer = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => clearPollTimer, []);

  const fetchResult = useCallback(async (nextJobId: string) => {
    const response = await invoiceAPI.getUploadedInvoiceResult(nextJobId);
    setInvoiceData(response.result);
    setPhase('done');
  }, []);

  const pollStatus = useCallback(async (nextJobId: string) => {
    try {
      const status = await invoiceAPI.getUploadedInvoiceStatus(nextJobId);
      setPhase(status.status);

      if (status.status === 'done') {
        clearPollTimer();
        await fetchResult(nextJobId);
        return;
      }

      if (status.status === 'failed') {
        clearPollTimer();
        setError(status.error || 'Invoice processing failed');
        return;
      }

      pollTimerRef.current = setTimeout(() => void pollStatus(nextJobId), 1500);
    } catch (pollError) {
      clearPollTimer();
      setPhase('failed');
      setError(getUploadErrorMessage(pollError));
    }
  }, [fetchResult]);

  const validateFile = (file: File): string | null => {
    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    const hasPdfMime = file.type === 'application/pdf';

    if (!hasPdfExtension || !hasPdfMime) {
      return 'Please upload a PDF invoice file.';
    }
    if (file.size === 0) {
      return 'The selected PDF is empty.';
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return `PDF exceeds the ${MAX_UPLOAD_MB}MB upload limit.`;
    }
    return null;
  };

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setPhase('idle');
      setInvoiceData(null);
      return;
    }

    try {
      clearPollTimer();
      setError(null);
      setInvoiceData(null);
      setFilename(file.name);
      setUploadProgress(0);
      setPhase('uploading');

      const response = await invoiceAPI.uploadInvoicePdf(file, setUploadProgress);
      setJobId(response.job_id);
      setPhase(response.status);
      await pollStatus(response.job_id);
    } catch (uploadError) {
      setPhase('failed');
      setError(getUploadErrorMessage(uploadError));
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void uploadFile(file);
    }
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void uploadFile(file);
    }
  };

  const isBusy = phase === 'uploading' || phase === 'queued' || phase === 'processing';
  const statusLabel = phase === 'idle' ? 'Ready' : phase.charAt(0).toUpperCase() + phase.slice(1);

  return (
    <div className="space-y-6">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 bg-white'
        } ${isBusy ? 'opacity-80 pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          aria-label="Upload PDF invoice"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleInputChange}
          disabled={isBusy}
        />
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-900">
          {isDragging ? 'Drop the PDF invoice here' : 'Drag and drop a PDF invoice, or click to upload'}
        </p>
        <p className="mt-1 text-xs text-gray-500">PDF only, up to {MAX_UPLOAD_MB}MB</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Upload Status</p>
            <p className="text-sm font-medium text-gray-900">{statusLabel}</p>
          </div>
          {filename && <span className="max-w-[220px] truncate text-sm text-gray-600">{filename}</span>}
        </div>
        {phase === 'uploading' && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p className="mt-2 text-xs text-gray-500">{uploadProgress}% uploaded</p>
          </div>
        )}
        {(phase === 'queued' || phase === 'processing') && (
          <p className="mt-3 text-sm text-gray-600">OCR extraction is {phase}.</p>
        )}
        {jobId && <p className="mt-2 text-xs text-gray-500">Job ID: {jobId}</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {invoiceData && jobId && (
        <ManualCorrectionInterface
          documentId={jobId}
          invoiceData={invoiceData}
          usePythonJobId
          onSave={setInvoiceData}
        />
      )}
    </div>
  );
};

export default PdfInvoiceUpload;
