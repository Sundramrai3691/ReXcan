import { google } from 'googleapis';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { EmailInvoiceMessage } from './pubsub.service.js';
import { Readable } from 'stream';

interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  data: string; // Base64 encoded
}

class EmailService {
  private gmail: any = null;
  private imap: Imap | null = null;

  constructor() {
    if (env.email.provider === 'gmail' && env.email.gmail?.clientId) {
      this.initializeGmail();
    } else if (env.email.provider === 'imap' && env.email.imap?.user) {
      this.initializeImap();
    } else {
      logger.warn('Email service not configured');
    }
  }

  private initializeGmail(): void {
    try {
      const oauth2Client = new google.auth.OAuth2(
        env.email.gmail!.clientId,
        env.email.gmail!.clientSecret,
        'urn:ietf:wg:oauth:2.0:oob' // Redirect URI for installed apps
      );

      oauth2Client.setCredentials({
        refresh_token: env.email.gmail!.refreshToken,
      });

      this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      logger.info('Gmail service initialized');
    } catch (error) {
      logger.error('Failed to initialize Gmail service:', error);
    }
  }

  private initializeImap(): void {
    try {
      this.imap = new Imap({
        user: env.email.imap!.user,
        password: env.email.imap!.password,
        host: env.email.imap!.host,
        port: env.email.imap!.port,
        tls: env.email.imap!.tls,
        tlsOptions: { rejectUnauthorized: false },
      });

      this.imap.once('ready', () => {
        logger.info('IMAP connection ready');
      });

      this.imap.once('error', (err: Error) => {
        logger.error('IMAP error:', err);
      });

      this.imap.connect();
      logger.info('IMAP service initialized');
    } catch (error) {
      logger.error('Failed to initialize IMAP service:', error);
    }
  }

  async fetchEmailsWithAttachments(maxResults: number = 10): Promise<EmailInvoiceMessage[]> {
    if (env.email.provider === 'gmail') {
      return this.fetchEmailsFromGmail(maxResults);
    } else if (env.email.provider === 'imap') {
      return this.fetchEmailsFromImap(maxResults);
    } else {
      throw new Error('Email service not configured');
    }
  }

  private async fetchEmailsFromGmail(maxResults: number): Promise<EmailInvoiceMessage[]> {
    if (!this.gmail) {
      throw new Error('Gmail service not initialized');
    }

    try {
      // Search for emails with attachments (PDF or image files)
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'has:attachment (filename:pdf OR filename:png OR filename:jpg OR filename:jpeg)',
        maxResults,
      });

      const messages: EmailInvoiceMessage[] = [];

      if (!response.data.messages) {
        return messages;
      }

      for (const message of response.data.messages) {
        try {
          const fullMessage = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full',
          });

          const emailMessage = await this.parseGmailMessage(fullMessage.data);
          if (emailMessage && emailMessage.attachments.length > 0) {
            messages.push(emailMessage);
          }
        } catch (error) {
          logger.error(`Error processing Gmail message ${message.id}:`, error);
        }
      }

      return messages;
    } catch (error) {
      logger.error('Error fetching emails from Gmail:', error);
      throw error;
    }
  }

  private async parseGmailMessage(message: any): Promise<EmailInvoiceMessage | null> {
    try {
      const headers = message.payload.headers;
      const from = headers.find((h: any) => h.name === 'From')?.value || '';
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
      const messageId = headers.find((h: any) => h.name === 'Message-ID')?.value || '';
      const date = headers.find((h: any) => h.name === 'Date')?.value || '';

      const attachments: EmailAttachment[] = [];

      // Recursively extract attachments from message parts
      const extractAttachments = (parts: any[]): void => {
        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            // This is an attachment, fetch it
            attachments.push({
              filename: part.filename,
              contentType: part.mimeType || 'application/octet-stream',
              size: part.body.size || 0,
              data: '', // Will be fetched separately
            });
          } else if (part.parts) {
            extractAttachments(part.parts);
          }
        }
      };

      if (message.payload.parts) {
        extractAttachments(message.payload.parts);
      }

      // Fetch attachment data
      for (let i = 0; i < attachments.length; i++) {
        const part = this.findPartByFilename(message.payload, attachments[i].filename);
        if (part?.body?.attachmentId) {
          try {
            const attachmentData = await this.gmail.users.messages.attachments.get({
              userId: 'me',
              messageId: message.id,
              id: part.body.attachmentId,
            });
            attachments[i].data = attachmentData.data.data || '';
          } catch (error) {
            logger.error(`Error fetching attachment ${attachments[i].filename}:`, error);
          }
        }
      }

      // Filter to only invoice-like attachments (PDFs and images)
      const invoiceAttachments = attachments.filter(
        (att) =>
          att.filename.toLowerCase().endsWith('.pdf') ||
          att.filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|bmp|tiff|webp)$/i)
      );

      if (invoiceAttachments.length === 0) {
        return null;
      }

      return {
        emailId: message.id,
        messageId,
        from,
        subject,
        receivedAt: date,
        attachments: invoiceAttachments,
      };
    } catch (error) {
      logger.error('Error parsing Gmail message:', error);
      return null;
    }
  }

  private findPartByFilename(parts: any, filename: string): any {
    if (!parts.parts) {
      return null;
    }

    for (const part of parts.parts) {
      if (part.filename === filename) {
        return part;
      }
      if (part.parts) {
        const found = this.findPartByFilename(part, filename);
        if (found) return found;
      }
    }
    return null;
  }

  private async fetchEmailsFromImap(maxResults: number): Promise<EmailInvoiceMessage[]> {
    if (!this.imap) {
      throw new Error('IMAP service not initialized');
    }

    return new Promise((resolve, reject) => {
      const messages: EmailInvoiceMessage[] = [];

      this.imap!.openBox('INBOX', false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Fetch unread emails with attachments
        this.imap!.search(['UNSEEN', ['HAS', 'attachment']], (err, results) => {
          if (err) {
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            resolve(messages);
            return;
          }

          // Limit to maxResults
          const fetchResults = results.slice(0, maxResults);
          const fetch = this.imap!.fetch(fetchResults, {
            bodies: '',
            struct: true,
          });

          fetch.on('message', (msg, seqno) => {
            let parsedMail: ParsedMail | null = null;

            msg.on('body', (stream) => {
              simpleParser(stream as Readable, (err, mail) => {
                if (err) {
                  logger.error(`Error parsing IMAP message ${seqno}:`, err);
                  return;
                }
                parsedMail = mail;
              });
            });

            msg.once('end', () => {
              if (parsedMail) {
                const emailMessage = this.parseImapMessage(parsedMail, seqno);
                if (emailMessage && emailMessage.attachments.length > 0) {
                  messages.push(emailMessage);
                }
              }
            });
          });

          fetch.once('error', (err) => {
            reject(err);
          });

          fetch.once('end', () => {
            resolve(messages);
          });
        });
      });
    });
  }

  private parseImapMessage(mail: ParsedMail, seqno: number): EmailInvoiceMessage | null {
    try {
      const attachments: EmailAttachment[] = [];

      if (mail.attachments) {
        for (const attachment of mail.attachments) {
          // Only process PDFs and images
          const filename = attachment.filename || 'unknown';
          const isInvoiceFile =
            filename.toLowerCase().endsWith('.pdf') ||
            filename.toLowerCase().match(/\.(png|jpg|jpeg|gif|bmp|tiff|webp)$/i);

          if (isInvoiceFile && attachment.content) {
            const content = attachment.content as Buffer;
            attachments.push({
              filename,
              contentType: attachment.contentType || 'application/octet-stream',
              size: content.length,
              data: content.toString('base64'),
            });
          }
        }
      }

      if (attachments.length === 0) {
        return null;
      }

      return {
        emailId: seqno.toString(),
        messageId: mail.messageId || seqno.toString(),
        from: mail.from?.text || '',
        subject: mail.subject || '',
        receivedAt: mail.date?.toISOString() || new Date().toISOString(),
        attachments,
      };
    } catch (error) {
      logger.error('Error parsing IMAP message:', error);
      return null;
    }
  }

  async markEmailAsProcessed(emailId: string): Promise<void> {
    if (env.email.provider === 'gmail') {
      // Gmail: Add label or move to processed folder
      // This is optional - you can implement label management here
      logger.info(`Marking Gmail message ${emailId} as processed`);
    } else if (env.email.provider === 'imap') {
      // IMAP: Mark as read
      if (this.imap) {
        // Implementation for marking IMAP email as read
        logger.info(`Marking IMAP message ${emailId} as processed`);
      }
    }
  }

  isInitialized(): boolean {
    return this.gmail !== null || this.imap !== null;
  }

  getProvider(): 'gmail' | 'imap' | null {
    if (this.gmail) return 'gmail';
    if (this.imap) return 'imap';
    return null;
  }
}

export const emailService = new EmailService();

