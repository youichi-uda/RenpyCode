/**
 * Ren'Py lexical scanner.
 * Line-based tokenizer that identifies indentation, comments, and line structure.
 */

export interface ScannedLine {
  lineNumber: number;   // 0-based
  indent: number;       // number of leading spaces (tabs expanded to 4)
  content: string;      // trimmed content (without leading whitespace)
  raw: string;          // original line text
  isEmpty: boolean;     // blank or comment-only
  isComment: boolean;
}

/**
 * Scan a document into lines with indentation info.
 */
export function scanLines(text: string): ScannedLine[] {
  const rawLines = text.split(/\r?\n/);
  const result: ScannedLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const expanded = expandTabs(raw);
    const indent = getIndent(expanded);
    const content = expanded.trimStart();
    const isComment = content.startsWith('#');
    const isEmpty = content === '' || isComment;

    result.push({
      lineNumber: i,
      indent,
      content,
      raw,
      isEmpty,
      isComment,
    });
  }

  return result;
}

/**
 * Expand tabs to 4 spaces (Ren'Py default).
 */
function expandTabs(line: string): string {
  return line.replace(/\t/g, '    ');
}

/**
 * Count leading spaces.
 */
function getIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count++;
    else break;
  }
  return count;
}

/**
 * Check if a line has mixed tabs and spaces in its indentation.
 */
export function hasMixedIndentation(raw: string): boolean {
  const leading = raw.match(/^[\t ]+/);
  if (!leading) return false;
  const s = leading[0];
  return s.includes('\t') && s.includes(' ');
}
