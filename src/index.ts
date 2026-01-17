/**
 * Granola CLI — Library exports
 *
 * @example
 * ```ts
 * import { GranolaClient, extractGranolaToken } from 'granola-cli';
 *
 * const token = await extractGranolaToken();
 * const client = new GranolaClient(token);
 * const workspaces = await client.getWorkspaces();
 *
 * // Or use local cache directly
 * import { getMeetings, searchDocuments } from 'granola-cli';
 * const meetings = getMeetings();
 * const results = searchDocuments('standup');
 * ```
 */

// Client
export { GranolaClient } from './client.js';
export type { ClientOptions } from './client.js';

// Types
export type {
  Document,
  DocumentsResponse,
  TranscriptSegment,
  Workspace,
  WorkspaceResponse,
  Person,
  CalendarEvent,
  MeetingOutput,
  TranscriptOutput,
} from './types.js';

// Cache utilities
export {
  loadCache,
  getDocuments,
  getMeetings,
  findDocument,
  searchDocuments,
  getTranscripts,
  getDocumentTranscript,
  getCacheStats,
  getCachePath,
  formatDate,
  getDocumentDate,
  getPeopleArray,
  getPeople,
  getCompanies,
  getFolders,
  getDocumentsByFolder,
  getDocumentsByPerson,
  getSharedDocuments,
  getCurrentUser,
  getWorkspacesFromCache,
} from './lib/cache.js';

// Token utilities
export {
  extractGranolaToken,
  hasToken,
  getSupabasePath,
} from './lib/token.js';

// Output utilities
export {
  exportToMarkdown,
  documentToJson,
} from './lib/output.js';
