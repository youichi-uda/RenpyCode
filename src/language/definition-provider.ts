/**
 * Ren'Py Go-to-Definition and Find All References providers.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, CommandNode, DialogueNode, LABEL_REF_COMMANDS } from '../parser/types';

export class RenpyDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Definition | undefined {
    const range = document.getWordRangeAtPosition(position, /[\w.]+/);
    if (!range) return undefined;

    const word = document.getText(range);
    const lineText = document.lineAt(position.line).text;
    const trimmed = lineText.trimStart();
    const index = this.getIndex();

    // ── Jump/call → label definition ──
    if (/^(jump|call)\s+/.test(trimmed)) {
      const entries = index.labels.get(word);
      if (entries) {
        return entries.map(e => this.toLocation(e.file, e.node.line));
      }
    }

    // ── Show/call screen → screen definition ──
    if (/^(?:show|call)\s+screen\s+/.test(trimmed) || /^use\s+/.test(trimmed)) {
      const entries = index.screens.get(word);
      if (entries) {
        return entries.map(e => this.toLocation(e.file, e.node.line));
      }
    }

    // ── Character reference → define ──
    const charEntry = index.characters.get(word);
    if (charEntry) {
      return this.toLocation(charEntry.file, charEntry.node.line);
    }

    // ── Variable reference → define/default ──
    const varEntry = index.variables.get(word);
    if (varEntry) {
      return this.toLocation(varEntry.file, varEntry.node.line);
    }

    // ── Label definition ──
    const labelEntries = index.labels.get(word);
    if (labelEntries) {
      return labelEntries.map(e => this.toLocation(e.file, e.node.line));
    }

    // ── Screen definition ──
    const screenEntries = index.screens.get(word);
    if (screenEntries) {
      return screenEntries.map(e => this.toLocation(e.file, e.node.line));
    }

    // ── Transform definition ──
    const transformEntry = index.transforms.get(word);
    if (transformEntry) {
      return this.toLocation(transformEntry.file, transformEntry.node.line);
    }

    // ── Image definition ──
    const imageEntries = index.images.get(word);
    if (imageEntries) {
      return imageEntries.map(e => this.toLocation(e.file, e.node.line));
    }

    return undefined;
  }

  private toLocation(file: string, line: number): vscode.Location {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const uri = workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, file)
      : vscode.Uri.file(file);
    return new vscode.Location(uri, new vscode.Position(line, 0));
  }
}

export class RenpyReferenceProvider implements vscode.ReferenceProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    _token: vscode.CancellationToken,
  ): vscode.Location[] {
    const range = document.getWordRangeAtPosition(position, /[\w.]+/);
    if (!range) return [];

    const word = document.getText(range);
    const index = this.getIndex();
    const locations: vscode.Location[] = [];

    // Search all files for references
    for (const [filePath, parsed] of index.files) {
      this.findReferences(parsed.nodes, word, filePath, locations);
    }

    // Include definition if requested
    if (context.includeDeclaration) {
      const labelEntries = index.labels.get(word);
      if (labelEntries) {
        for (const e of labelEntries) {
          locations.push(this.toLocation(e.file, e.node.line));
        }
      }
    }

    return locations;
  }

  private findReferences(
    nodes: RenpyNode[],
    name: string,
    file: string,
    locations: vscode.Location[],
  ): void {
    for (const node of nodes) {
      // Jump/call references to labels
      if (node.type === 'command' && LABEL_REF_COMMANDS.has(node.command) && node.target === name) {
        locations.push(this.toLocation(file, node.line));
      }

      // Dialogue character references
      if (node.type === 'dialogue' && node.character === name) {
        locations.push(this.toLocation(file, node.line));
      }

      // Recurse into children
      if (node.children.length > 0) {
        this.findReferences(node.children, name, file, locations);
      }
    }
  }

  private toLocation(file: string, line: number): vscode.Location {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const uri = workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, file)
      : vscode.Uri.file(file);
    return new vscode.Location(uri, new vscode.Position(line, 0));
  }
}
