/**
 * Token extraction utilities for Granola
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { GranolaConfig, TokenData } from '../types.js';

const SUPABASE_PATHS = {
  darwin: join(homedir(), 'Library/Application Support/Granola/supabase.json'),
  linux: join(homedir(), '.config/Granola/supabase.json'),
  win32: join(homedir(), 'AppData/Roaming/Granola/supabase.json'),
};

/**
 * Get the path to Granola's supabase.json based on platform
 */
export function getSupabasePath(): string {
  const platform = process.platform as keyof typeof SUPABASE_PATHS;
  return SUPABASE_PATHS[platform] || SUPABASE_PATHS.darwin;
}

/**
 * Extract Granola API token from local app storage
 * Tries WorkOS tokens first (new auth), falls back to Cognito (legacy)
 */
export async function extractGranolaToken(): Promise<string> {
  const supabasePath = getSupabasePath();

  if (!existsSync(supabasePath)) {
    throw new Error(`Granola config not found at ${supabasePath}. Is Granola installed and logged in?`);
  }

  const raw = readFileSync(supabasePath, 'utf8');
  const config: GranolaConfig = JSON.parse(raw);

  // Try WorkOS tokens first (new auth system)
  if (config.workos_tokens) {
    try {
      const tokens: TokenData = JSON.parse(config.workos_tokens);
      if (tokens.access_token) {
        return tokens.access_token;
      }
    } catch {
      // Fall through to legacy
    }
  }

  // Fall back to Cognito tokens (legacy)
  if (config.cognito_tokens) {
    try {
      const tokens: TokenData = JSON.parse(config.cognito_tokens);
      if (tokens.access_token) {
        return tokens.access_token;
      }
    } catch {
      // Fall through to error
    }
  }

  throw new Error('No valid access token found in Granola config. Try logging out and back in to Granola.');
}

/**
 * Check if a token is available without throwing
 */
export function hasToken(): boolean {
  try {
    const supabasePath = getSupabasePath();
    if (!existsSync(supabasePath)) {
      return false;
    }

    const raw = readFileSync(supabasePath, 'utf8');
    const config: GranolaConfig = JSON.parse(raw);

    if (config.workos_tokens) {
      const tokens = JSON.parse(config.workos_tokens);
      if (tokens.access_token) {
        return true;
      }
    }

    if (config.cognito_tokens) {
      const tokens = JSON.parse(config.cognito_tokens);
      if (tokens.access_token) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
