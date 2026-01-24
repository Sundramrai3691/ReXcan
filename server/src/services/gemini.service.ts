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
 * Lists available Gemini models (for debugging)
 */
export async function listAvailableModels(): Promise<void> {
  try {
    if (!env.apiKeys.google) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models`;
    const response = await fetch(apiUrl, {
      headers: {
        'x-goog-api-key': env.apiKeys.google,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Failed to list models: ${response.status} - ${errorText}`);
      return;
    }

    const data = await response.json() as {
      models?: Array<{
        name?: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }>;
    };

    if (data.models) {
      logger.info('Available Gemini models:');
      data.models.forEach((model) => {
        logger.info(
          `  - ${model.name} (${model.displayName || 'N/A'}) ` +
          `- Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`
        );
      });
    }
  } catch (error) {
    logger.error('Error listing available models:', error);
  }
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
 * Extracts invoice data from an image using Google Gemini API
 */
export async function extractInvoiceDataFromImage(
  imagePath: string
): Promise<InvoiceExtractionResult> {
  try {
    if (!env.apiKeys.google) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    logger.info(`Extracting invoice data from image using Gemini: ${imagePath}`);

    // Convert image to base64
    const base64Image = await imageToBase64(imagePath);
    const mimeType = getMimeType(imagePath);

    // Prepare the prompt for invoice extraction
    const systemInstruction = `You are an expert invoice data extraction system. Extract all relevant invoice information from the provided image and return it as a valid JSON object. Be accurate and extract all available fields. If a field is not present in the invoice, you may omit it or set it to null. Always return valid JSON.`;

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

    // Call Gemini API
    // Using the correct endpoint format from: https://ai.google.dev/gemini-api/docs/quickstart
    const model = 'gemini-2.5-flash'; // Gemini model (supports images and PDFs)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.apiKeys.google, // API key in header, not query parameter
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${systemInstruction}\n\n${userPrompt}`,
              },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Gemini API error: ${response.status} - ${errorText}`);
      
      // If 404, suggest trying alternative models
      if (response.status === 404) {
        try {
          const errorObj = JSON.parse(errorText);
          if (errorObj.error?.message?.includes('not found')) {
            // Log available models for debugging
            await listAvailableModels();
            throw new Error(
              `Gemini API error: Model '${model}' not found. ` +
              `Check the logs above for available models or visit: ` +
              `https://generativelanguage.googleapis.com/v1beta/models?key=${env.apiKeys.google}`
            );
          }
        } catch {
          // If error text is not JSON, continue with original error
        }
      }
      
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      logger.error('Invalid response from Gemini API', data);
      throw new Error('Invalid response from Gemini API');
    }

    const parts = data.candidates[0].content.parts;
    if (!parts || !parts[0] || !parts[0].text) {
      logger.error('No text content in Gemini API response', data);
      throw new Error('No text content in Gemini API response');
    }

    const content = parts[0].text;
    
    // Parse the JSON response
    let extractedData: InvoiceExtractionResult;
    try {
      extractedData = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      logger.error('Error parsing Gemini response', { content, parseError });
      // Try to extract JSON from the response if it's wrapped in markdown
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse JSON from Gemini response');
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
 * Extracts invoice data from a PDF file using Google Gemini API
 * Note: Gemini supports PDFs directly, so we can send them as-is
 */
export async function extractInvoiceDataFromPDF(
  pdfPath: string
): Promise<InvoiceExtractionResult> {
  try {
    logger.info(`Extracting invoice data from PDF using Gemini: ${pdfPath}`);
    
    // Gemini supports PDFs directly, so we can send the PDF as base64
    const pdfBuffer = await fs.readFile(pdfPath);
    const base64Pdf = pdfBuffer.toString('base64');

    if (!env.apiKeys.google) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    const systemInstruction = `You are an expert invoice data extraction system. Extract all relevant invoice information from the provided PDF document and return it as a valid JSON object. Be accurate and extract all available fields. If a field is not present in the invoice, you may omit it or set it to null. Always return valid JSON.`;

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

    // Call Gemini API
    // Using the correct endpoint format from: https://ai.google.dev/gemini-api/docs/quickstart
    const model = 'gemini-2.5-flash'; // Gemini model (supports images and PDFs)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.apiKeys.google, // API key in header, not query parameter
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${systemInstruction}\n\n${userPrompt}`,
              },
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64Pdf,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Gemini API error for PDF: ${response.status} - ${errorText}`);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      logger.error('Invalid response from Gemini API', data);
      throw new Error('Invalid response from Gemini API');
    }

    const parts = data.candidates[0].content.parts;
    if (!parts || !parts[0] || !parts[0].text) {
      logger.error('No text content in Gemini API response', data);
      throw new Error('No text content in Gemini API response');
    }

    const content = parts[0].text;
    
    let extractedData: InvoiceExtractionResult;
    try {
      extractedData = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      logger.error('Error parsing Gemini response', { content, parseError });
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse JSON from Gemini response');
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

