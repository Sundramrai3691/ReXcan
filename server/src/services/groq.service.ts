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
 * Extracts invoice data from an image using Groq API
 */
export async function extractInvoiceDataFromImage(
  imagePath: string
): Promise<InvoiceExtractionResult> {
  try {
    if (!env.apiKeys.groq) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    logger.info(`Extracting invoice data from image: ${imagePath}`);

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

    // Call Groq API
    // Groq uses OpenAI-compatible API endpoint
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.apiKeys.groq}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview', // Groq's vision model (updated from decommissioned 90b model)
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
      logger.error(`Groq API error: ${response.status} - ${errorText}`);
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      logger.error('Invalid response from Groq API', data);
      throw new Error('Invalid response from Groq API');
    }

    const content = data.choices[0].message.content;
    
    if (!content) {
      logger.error('No content in Groq API response', data);
      throw new Error('No content in Groq API response');
    }
    
    // Parse the JSON response
    let extractedData: InvoiceExtractionResult;
    try {
      extractedData = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      logger.error('Error parsing Groq response', { content, parseError });
      // Try to extract JSON from the response if it's wrapped in markdown
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse JSON from Groq response');
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
 * Extracts invoice data from a PDF file
 * Note: This function converts the first page of the PDF to an image
 * For multi-page PDFs, you may want to process each page separately
 */
export async function extractInvoiceDataFromPDF(
  pdfPath: string
): Promise<InvoiceExtractionResult> {
  try {
    logger.info(`Extracting invoice data from PDF: ${pdfPath}`);
    
    // For now, we'll use a simple approach: convert PDF first page to image
    // In production, you might want to use pdf-poppler or pdf2pic
    // For this implementation, we'll try to use the PDF directly if Groq supports it
    // Otherwise, we'll need to convert it to an image first
    
    // Try to read PDF as base64 and send it directly
    // Note: Groq's vision models may support PDFs directly, but if not, we'll need conversion
    const pdfBuffer = await fs.readFile(pdfPath);
    const base64Pdf = pdfBuffer.toString('base64');

    if (!env.apiKeys.groq) {
      throw new Error('GROQ_API_KEY is not configured');
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

    // Try sending PDF as base64
    // Note: Groq may require PDF to be converted to image first
    // If this doesn't work, we'll need to add PDF to image conversion
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.apiKeys.groq}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview', // Groq's vision model (updated from decommissioned 90b model)
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
      // If PDF direct upload fails, we might need to convert to image
      // For now, throw an error and suggest using image conversion
      const errorText = await response.text();
      logger.error(`Groq API error for PDF: ${response.status} - ${errorText}`);
      throw new Error(`Groq API error: ${response.status}. PDF may need to be converted to image first.`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      logger.error('Invalid response from Groq API', data);
      throw new Error('Invalid response from Groq API');
    }

    const content = data.choices[0].message.content;
    
    if (!content) {
      logger.error('No content in Groq API response', data);
      throw new Error('No content in Groq API response');
    }
    
    let extractedData: InvoiceExtractionResult;
    try {
      extractedData = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      logger.error('Error parsing Groq response', { content, parseError });
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse JSON from Groq response');
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

