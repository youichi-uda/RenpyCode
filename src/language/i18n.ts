/**
 * Locale utility for RenPy Code.
 * Detects VS Code's display language and provides helpers
 * to select localized strings.
 */

import * as vscode from 'vscode';

/** Whether the current VS Code session is in Japanese. */
export function isJapanese(): boolean {
  return vscode.env.language.startsWith('ja');
}

/**
 * Pick the appropriate description based on current locale.
 * Falls back to English if Japanese is unavailable.
 */
export function localize(en: string, ja?: string): string {
  if (isJapanese() && ja) return ja;
  return en;
}
