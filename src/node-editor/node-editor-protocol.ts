/**
 * Type definitions for the interactive node editor.
 * Shared between the extension-side provider and the WebView.
 */

/** Node in the visual editor */
export interface EditorNode {
  id: string;
  label: string;
  type: 'start' | 'normal' | 'choice' | 'dead_end' | 'orphan';
  x: number;
  y: number;
  width: number;
  height: number;
  file: string;
  line: number;
  hasMenu: boolean;
  hasReturn: boolean;
  dialogueCount: number;
  dialoguePreview: string[];
  choices: string[];
  collapsed: boolean;
}

/** Edge connecting two nodes */
export interface EditorEdge {
  id: string;
  from: string;
  to: string;
  fromPort: string;
  toPort: string;
  type: 'jump' | 'call' | 'choice';
  choiceText?: string;
}

/** Full graph state */
export interface EditorGraph {
  nodes: EditorNode[];
  edges: EditorEdge[];
}

// ── WebView -> Extension messages ──

export type WebViewMessage =
  | { type: 'navigate'; file: string; line: number }
  | { type: 'warp'; file: string; line: number }
  | { type: 'createLabel'; name: string; afterLabel?: string }
  | { type: 'createMenu'; parentLabel: string; choices: string[] }
  | { type: 'connect'; from: string; to: string; edgeType: 'jump' | 'call' }
  | { type: 'disconnect'; from: string; to: string }
  | { type: 'deleteNode'; nodeId: string }
  | { type: 'editDialogue'; nodeId: string; lines: string[] }
  | { type: 'renameLabel'; oldName: string; newName: string }
  | { type: 'moveNodes'; positions: { id: string; x: number; y: number }[] }
  | { type: 'requestAutoLayout' }
  | { type: 'requestRefresh' }
  | { type: 'undo' }
  | { type: 'redo' };

// ── Extension -> WebView messages ──

export type ExtensionMessage =
  | { type: 'fullGraph'; graph: EditorGraph }
  | { type: 'layoutResult'; positions: { id: string; x: number; y: number }[] }
  | { type: 'error'; message: string }
  | { type: 'undoState'; canUndo: boolean; canRedo: boolean };
