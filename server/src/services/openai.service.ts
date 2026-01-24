import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export interface InvoiceExtractionResult {
  invoiceNumber?: string;
  vendorName?: string;
  invoiceDate?: string;
  totalAmount?: number;
  currency?: string;
  lineItems?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    amount?: number;
  }>;
  taxInformation?: {
    taxRate?: number;
    taxAmount?: number;
  };
  rawExtraction?: Record<string, unknown>;
}

/**
 * Converts an image file to base64 string
 */
async function imageToBase64(imagePath: string): Promise<string> {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    return base64Image;
  } catch (error) {
    logger.error(`Error converting image to base64: ${imagePath}`, error);
    throw error;
  }
}

/**
 * Determines the MIME type based on file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

/**
 * Extracts invoice data from an image using OpenAI API (GPT-4 Vision)
 */
export async function extractInvoiceDataFromImage(
  imagePath: string
): Promise<InvoiceExtractionResult> {
  try {
    if (!env.apiKeys.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    logger.info(`Extracting invoice data from image using OpenAI: ${imagePath}`);

    // Convert image to base64
    const base64Image = await imageToBase64(imagePath);
    const mimeType = getMimeType(imagePath);

    // Prepare the prompt for invoice extraction
    const systemPrompt = `You are an expert invoice data extraction system. Extract all relevant invoice information from the provided image and return it as a valid JSON object. Be accurate and extract all available fields. If a field is not present in the invoice, you may omit it or set it to null. Always return valid JSON.`;

    const userPrompt = `Extract all invoice information from this image and return it as a JSON object with the following structure:
{
  "invoiceNumber": "string or null",
  "vendorName": "string or null",
  "invoiceDate": "YYYY-MM-DD format or null",
  "totalAmount": number or null,
  "currency": "string (e.g., USD, EUR) or null",
  "lineItems": [{"description": "string", "quantity": number, "unitPrice": number, "amount": number}] or null,
  "taxInformation": {"taxRate": number, "taxAmount": number} or null,
}

Extract all available information from the invoice. Convert dates to YYYY-MM-DD format. Return only valid JSON, no additional text.`;

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.apiKeys.openai}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // OpenAI's latest vision model
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' }, // Request JSON response
        temperature: 0.1, // Low temperature for more consistent extraction
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`OpenAI API error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      logger.error('Invalid response from OpenAI API', data);
      throw new Error('Invalid response from OpenAI API');
    }

    const content = data.choices[0].message.content;
    
    if (!content) {
      logger.error('No content in OpenAI API response', data);
      throw new Error('No content in OpenAI API response');
    }
    
    // Parse the JSON response
    let extractedData: InvoiceExtractionResult;
    try {
      extractedData = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      logger.error('Error parsing OpenAI response', { content, parseError });
      // Try to extract JSON from the response if it's wrapped in markdown
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse JSON from OpenAI response');
      }
    }

    // Store raw extraction for debugging
    extractedData.rawExtraction = data as Record<string, unknown>;

    logger.info(`Successfully extracted invoice data from ${imagePath}`);
    return extractedData;
  } catch (error) {
    logger.error(`Error extracting invoice data from ${imagePath}:`, error);
    throw error;
  }
}

/**
 * Extracts invoice data from a PDF file using OpenAI API
 * Note: OpenAI's vision models work with images, so PDFs need to be converted to images first
 * For now, we'll try sending the PDF directly, but conversion may be needed
 */
export async function extractInvoiceDataFromPDF(
  pdfPath: string
): Promise<InvoiceExtractionResult> {
  try {
    logger.info(`Extracting invoice data from PDF using OpenAI: ${pdfPath}`);
    
    // OpenAI's vision models work with images, not PDFs directly
    // For PDFs, we need to convert them to images first
    // For now, we'll read the PDF as base64 and try sending it
    // In production, you should convert PDF pages to images using a library like pdf-poppler
    
    const pdfBuffer = await fs.readFile(pdfPath);
    const base64Pdf = pdfBuffer.toString('base64');

    if (!env.apiKeys.openai) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const systemPrompt = `You are an expert invoice data extraction system. Extract all relevant invoice information from the provided PDF document and return it as a valid JSON object. Be accurate and extract all available fields. If a field is not present in the invoice, you may omit it or set it to null. Always return valid JSON.`;

    const userPrompt = `Extract all invoice information from this PDF document and return it as a JSON object with the following structure:
{
  "invoiceNumber": "string or null",
  "vendorName": "string or null",
  "invoiceDate": "YYYY-MM-DD format or null",
  "totalAmount": number or null,
  "currency": "string (e.g., USD, EUR) or null",
  "lineItems": [{"description": "string", "quantity": number, "unitPrice": number, "amount": number}] or null,
  "taxInformation": {"taxRate": number, "taxAmount": number} or null,
}

Extract all available information from the invoice. Convert dates to YYYY-MM-DD format. Return only valid JSON, no additional text.`;

    // Note: OpenAI's vision models may not support PDFs directly
    // You may need to convert PDF to images first
    // For now, we'll try sending it as an image_url with PDF MIME type
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.apiKeys.openai}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // OpenAI's latest vision model
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${base64Pdf}`,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' }, // Request JSON response
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      // If PDF direct upload fails, we need to convert to image
      const errorText = await response.text();
      logger.error(`OpenAI API error for PDF: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status}. PDF may need to be converted to image first. For PDFs, consider converting each page to an image format (PNG/JPEG) before processing.`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      logger.error('Invalid response from OpenAI API', data);
      throw new Error('Invalid response from OpenAI API');
    }

    const content = data.choices[0].message.content;
    
    if (!content) {
      logger.error('No content in OpenAI API response', data);
      throw new Error('No content in OpenAI API response');
    }
    
    let extractedData: InvoiceExtractionResult;
    try {
      extractedData = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      logger.error('Error parsing OpenAI response', { content, parseError });
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse JSON from OpenAI response');
      }
    }

    extractedData.rawExtraction = data as Record<string, unknown>;

    logger.info(`Successfully extracted invoice data from PDF: ${pdfPath}`);
    return extractedData;
  } catch (error) {
    logger.error(`Error extracting invoice data from PDF: ${pdfPath}`, error);
    throw error;
  }
}

