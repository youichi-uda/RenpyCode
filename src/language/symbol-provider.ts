/**
 * Ren'Py document and workspace symbol providers.
 * Provides outline (breadcrumbs) and Ctrl+T workspace search.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, ParsedFile } from '../parser/types';
import { Parser } from '../parser/parser';

export class RenpyDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.DocumentSymbol[] {
    const fileName = vscode.workspace.asRelativePath(document.uri);
    const index = this.getIndex();
    const parsed = index.files.get(fileName);

    if (!parsed) {
      // Parse on the fly if not indexed
      const parser = new Parser(fileName);
      const result = parser.parse(document.getText());
      return this.nodesToSymbols(result.nodes, document);
    }

    return this.nodesToSymbols(parsed.nodes, document);
  }

  private nodesToSymbols(nodes: RenpyNode[], document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];

    for (const node of nodes) {
      const symbol = this.nodeToSymbol(node, document);
      if (symbol) {
        // Add children
        if (node.children.length > 0) {
          symbol.children = this.nodesToSymbols(node.children, document);
        }
        symbols.push(symbol);
      }
    }

    return symbols;
  }

  private nodeToSymbol(node: RenpyNode, document: vscode.TextDocument): vscode.DocumentSymbol | undefined {
    const range = new vscode.Range(
      node.range.start.line, node.range.start.column,
      node.range.end.line, node.range.end.column,
    );

    switch (node.type) {
      case 'label': {
        const selRange = new vscode.Range(
          node.nameRange.start.line, node.nameRange.start.column,
          node.nameRange.end.line, node.nameRange.end.column,
        );
        return new vscode.DocumentSymbol(
          node.name, node.parameters ? `(${node.parameters})` : '',
          vscode.SymbolKind.Function, range, selRange,
        );
      }
      case 'screen': {
        const selRange = new vscode.Range(
          node.nameRange.start.line, node.nameRange.start.column,
          node.nameRange.end.line, node.nameRange.end.column,
        );
        return new vscode.DocumentSymbol(
          node.name, node.parameters ? `(${node.parameters})` : '',
          vscode.SymbolKind.Class, range, selRange,
        );
      }
      case 'define':
      case 'default':
        return new vscode.DocumentSymbol(
          node.name, node.value,
          vscode.SymbolKind.Variable, range,
          new vscode.Range(
            node.nameRange.start.line, node.nameRange.start.column,
            node.nameRange.end.line, node.nameRange.end.column,
          ),
        );
      case 'image_def':
        return new vscode.DocumentSymbol(
          node.name, node.value ?? '(ATL)',
          vscode.SymbolKind.File, range,
          new vscode.Range(
            node.nameRange.start.line, node.nameRange.start.column,
            node.nameRange.end.line, node.nameRange.end.column,
          ),
        );
      case 'transform_def':
        return new vscode.DocumentSymbol(
          node.name, node.parameters ? `(${node.parameters})` : '',
          vscode.SymbolKind.Event, range,
          new vscode.Range(
            node.nameRange.start.line, node.nameRange.start.column,
            node.nameRange.end.line, node.nameRange.end.column,
          ),
        );
      case 'style_def':
        return new vscode.DocumentSymbol(
          node.name, node.parent ? `is ${node.parent}` : '',
          vscode.SymbolKind.Property, range,
          new vscode.Range(
            node.nameRange.start.line, node.nameRange.start.column,
            node.nameRange.end.line, node.nameRange.end.column,
          ),
        );
      case 'testcase':
        return new vscode.DocumentSymbol(
          node.name, 'testcase',
          vscode.SymbolKind.Method, range,
          new vscode.Range(
            node.nameRange.start.line, node.nameRange.start.column,
            node.nameRange.end.line, node.nameRange.end.column,
          ),
        );
      case 'init_block':
        return new vscode.DocumentSymbol(
          `init${node.priority !== undefined ? ' ' + node.priority : ''}${node.isPython ? ' python' : ''}`,
          '', vscode.SymbolKind.Namespace, range, range,
        );
      case 'menu':
        return new vscode.DocumentSymbol(
          node.label ? `menu ${node.label}` : 'menu',
          '', vscode.SymbolKind.Enum, range, range,
        );
      case 'command':
        if (['jump', 'call'].includes(node.command) && node.target) {
          return new vscode.DocumentSymbol(
            `${node.command} ${node.target}`, '',
            vscode.SymbolKind.Key, range, range,
          );
        }
        return undefined;
      default:
        return undefined;
    }
  }
}

export class RenpyWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideWorkspaceSymbols(
    query: string,
    _token: vscode.CancellationToken,
  ): vscode.SymbolInformation[] {
    const index = this.getIndex();
    const lowerQuery = query.toLowerCase();
    const symbols: vscode.SymbolInformation[] = [];

    // Labels
    for (const [name, entries] of index.labels) {
      if (!lowerQuery || name.toLowerCase().includes(lowerQuery)) {
        for (const entry of entries) {
          symbols.push(this.toSymbolInfo(name, vscode.SymbolKind.Function, entry.file, entry.node.line));
        }
      }
    }

    // Screens
    for (const [name, entries] of index.screens) {
      if (!lowerQuery || name.toLowerCase().includes(lowerQuery)) {
        for (const entry of entries) {
          symbols.push(this.toSymbolInfo(name, vscode.SymbolKind.Class, entry.file, entry.node.line));
        }
      }
    }

    // Characters
    for (const [name, entry] of index.characters) {
      if (!lowerQuery || name.toLowerCase().includes(lowerQuery)) {
        symbols.push(this.toSymbolInfo(name, vscode.SymbolKind.Variable, entry.file, entry.node.line));
      }
    }

    // Transforms
    for (const [name, entry] of index.transforms) {
      if (!lowerQuery || name.toLowerCase().includes(lowerQuery)) {
        symbols.push(this.toSymbolInfo(name, vscode.SymbolKind.Event, entry.file, entry.node.line));
      }
    }

    // Images
    for (const [name, entries] of index.images) {
      if (!lowerQuery || name.toLowerCase().includes(lowerQuery)) {
        for (const entry of entries) {
          symbols.push(this.toSymbolInfo(name, vscode.SymbolKind.File, entry.file, entry.node.line));
        }
      }
    }

    return symbols;
  }

  private toSymbolInfo(name: string, kind: vscode.SymbolKind, file: string, line: number): vscode.SymbolInformation {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const uri = workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, file)
      : vscode.Uri.file(file);
    return new vscode.SymbolInformation(
      name, kind, '', new vscode.Location(uri, new vscode.Position(line, 0)),
    );
  }
}
