import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import PdfInvoiceUpload from './PdfInvoiceUpload';
import { invoiceAPI, type InvoiceExtract } from '../services/invoice.api';

jest.mock('../services/invoice.api', () => ({
  invoiceAPI: {
    uploadInvoicePdf: jest.fn(),
    getUploadedInvoiceStatus: jest.fn(),
    getUploadedInvoiceResult: jest.fn(),
    verifyPythonJobCorrections: jest.fn(),
  },
}));

const mockedInvoiceAPI = invoiceAPI as jest.Mocked<typeof invoiceAPI>;

describe('PdfInvoiceUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts only PDF files in the native file input', () => {
    render(<PdfInvoiceUpload />);

    const input = screen.getByLabelText('Upload PDF invoice') as HTMLInputElement;

    expect(input).toHaveAttribute('accept', 'application/pdf');
  });

  it('shows an error state for invalid uploads', async () => {
    render(<PdfInvoiceUpload />);

    const input = screen.getByLabelText('Upload PDF invoice');
    const invalidFile = new File(['hello'], 'invoice.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(await screen.findByText('Please upload a PDF invoice file.')).toBeInTheDocument();
    expect(mockedInvoiceAPI.uploadInvoicePdf).not.toHaveBeenCalled();
  });

  it('shows loading and processing state during async extraction', async () => {
    let resolveUpload: (value: {
      invoice_id: string;
      job_id: string;
      filename: string;
      status: 'queued';
      status_url: string;
      result_url: string;
    }) => void = () => {};

    mockedInvoiceAPI.uploadInvoicePdf.mockImplementation((_file, onUploadProgress) => {
      onUploadProgress?.(55);
      return new Promise((resolve) => {
        resolveUpload = resolve;
      });
    });
    mockedInvoiceAPI.getUploadedInvoiceStatus.mockResolvedValue({
      invoice_id: 'job-123',
      job_id: 'job-123',
      status: 'processing',
      has_result: false,
      error: null,
      logs: [],
    });
    mockedInvoiceAPI.getUploadedInvoiceResult.mockResolvedValue({
      invoice_id: 'job-123',
      job_id: 'job-123',
      status: 'done',
      result: { invoice_id: 'INV-001', line_items: [] } as InvoiceExtract,
    });

    render(<PdfInvoiceUpload />);

    const input = screen.getByLabelText('Upload PDF invoice');
    const pdfFile = new File(['%PDF-1.4\n%%EOF'], 'invoice.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [pdfFile] } });

    expect(await screen.findByText('Uploading')).toBeInTheDocument();
    await act(async () => {
      resolveUpload({
        invoice_id: 'job-123',
        job_id: 'job-123',
        filename: 'invoice.pdf',
        status: 'queued',
        status_url: '/api/invoices/job-123/status',
        result_url: '/api/invoices/job-123/result',
      });
    });
    await waitFor(() => expect(screen.getByText('Processing')).toBeInTheDocument());
    expect(screen.getByText('OCR extraction is processing.')).toBeInTheDocument();
  });
});
