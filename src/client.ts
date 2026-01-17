/**
 * Granola API Client
 * For making API calls to Granola's backend
 */

import type { Document, DocumentsResponse, TranscriptSegment, WorkspaceResponse } from './types.js';

const API_BASE = 'https://api.granola.ai';

export interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

export class GranolaClient {
  private token?: string;
  private baseUrl: string;
  private timeout: number;

  constructor(tokenOrOptions?: string | ClientOptions) {
    if (typeof tokenOrOptions === 'string') {
      this.token = tokenOrOptions;
      this.baseUrl = API_BASE;
      this.timeout = 30000;
    } else if (tokenOrOptions) {
      this.token = tokenOrOptions.apiKey;
      this.baseUrl = tokenOrOptions.baseUrl || API_BASE;
      this.timeout = tokenOrOptions.timeout || 30000;
    } else {
      this.baseUrl = API_BASE;
      this.timeout = 30000;
    }
  }

  setToken(token: string): void {
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    if (!this.token) {
      throw new Error('No API token set. Call setToken() or pass token to constructor.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`API error ${response.status}: ${text || response.statusText}`);
      }

      // fetch() auto-decompresses gzip
      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Get user's workspaces */
  async getWorkspaces(): Promise<WorkspaceResponse> {
    return this.request('POST', '/v1/get-workspaces', {});
  }

  /** Get documents with pagination */
  async getDocuments(
    options: {
      workspace_id?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<DocumentsResponse> {
    return this.request('POST', '/v2/get-documents', options);
  }

  /** Get document metadata */
  async getDocumentMetadata(documentId: string): Promise<Document> {
    return this.request('POST', '/v1/get-document-metadata', {
      document_id: documentId,
    });
  }

  /** Get document transcript */
  async getDocumentTranscript(documentId: string): Promise<TranscriptSegment[]> {
    const response = await this.request<TranscriptSegment[] | { transcript?: TranscriptSegment[] }>(
      'POST',
      '/v1/get-document-transcript',
      { document_id: documentId },
    );
    // API returns array directly, but handle wrapped response too
    if (Array.isArray(response)) {
      return response;
    }
    if (response.transcript) {
      return response.transcript;
    }
    // Handle object with numeric keys (parsed from array)
    const values = Object.values(response);
    if (values.length > 0 && typeof values[0] === 'object') {
      return values as TranscriptSegment[];
    }
    return [];
  }

  /** Update a document */
  async updateDocument(documentId: string, updates: { title?: string; notes_markdown?: string }): Promise<unknown> {
    return this.request('POST', '/v1/update-document', {
      document_id: documentId,
      ...updates,
    });
  }

  /** Iterate through all documents with automatic pagination */
  async *listAllDocuments(
    options: {
      workspace_id?: string;
      limit?: number;
    } = {},
  ): AsyncGenerator<Document, void, unknown> {
    let cursor: string | undefined;

    do {
      const response = await this.getDocuments({ ...options, cursor });

      if (response?.docs) {
        for (const doc of response.docs) {
          yield doc;
        }
      }

      cursor = response?.next_cursor;
    } while (cursor);
  }

  /** Get people data */
  async getPeople(): Promise<unknown> {
    return this.request('POST', '/v1/get-people', {});
  }

  /** Refresh Google Calendar events */
  async refreshGoogleEvents(): Promise<unknown> {
    return this.request('POST', '/v1/refresh-google-events', {});
  }

  /** Get subscriptions */
  async getSubscriptions(): Promise<unknown> {
    return this.request('POST', '/v1/get-subscriptions', {});
  }

  /** Get feature flags */
  async getFeatureFlags(): Promise<unknown> {
    return this.request('POST', '/v1/get-feature-flags', {});
  }
}
