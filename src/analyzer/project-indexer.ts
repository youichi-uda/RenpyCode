/**
 * Project-wide indexer for Ren'Py projects.
 * Scans all .rpy files and builds a global index of labels, characters, variables, screens, images, etc.
 */

import * as vscode from 'vscode';
import { Parser } from '../parser/parser';
import {
  ProjectIndex, ParsedFile, RenpyNode,
  LabelNode, ScreenNode, DefineNode, DefaultNode,
  ImageDefNode, TransformDefNode, TestcaseNode,
  CHARACTER_DEF_RE,
} from '../parser/types';

export class ProjectIndexer {
  private index: ProjectIndex;
  private parser: Parser;
  private _onDidUpdate = new vscode.EventEmitter<ProjectIndex>();

  readonly onDidUpdate = this._onDidUpdate.event;

  constructor() {
    this.index = this.createEmptyIndex();
    this.parser = new Parser('');
  }

  getIndex(): ProjectIndex {
    return this.index;
  }

  /**
   * Full re-index of all .rpy files in the workspace.
   */
  async indexWorkspace(): Promise<void> {
    this.index = this.createEmptyIndex();

    const files = await vscode.workspace.findFiles(
      '**/*.rpy',
      '{**/tl/**,**/_mcp/**,**/.git/**,**/*.rpe.py}',
    );

    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        this.indexDocument(doc);
      } catch {
        // Skip files that can't be opened
      }
    }

    await this.indexAssetFiles();

    this._onDidUpdate.fire(this.index);
  }

  /**
   * Index or re-index a single document.
   */
  indexDocument(document: vscode.TextDocument): ParsedFile {
    const fileName = vscode.workspace.asRelativePath(document.uri);
    this.parser = new Parser(fileName);
    const parsed = this.parser.parse(document.getText());

    // Remove old entries for this file
    this.removeFileFromIndex(fileName);

    // Add to files map
    this.index.files.set(fileName, parsed);

    // Index labels
    for (const [name, node] of parsed.labels) {
      const entries = this.index.labels.get(name) ?? [];
      entries.push({ file: fileName, node });
      this.index.labels.set(name, entries);
    }

    // Index screens
    for (const [name, node] of parsed.screens) {
      const entries = this.index.screens.get(name) ?? [];
      entries.push({ file: fileName, node });
      this.index.screens.set(name, entries);
    }

    // Index characters
    for (const [name, node] of parsed.characters) {
      this.index.characters.set(name, { file: fileName, node });
    }

    // Index images
    for (const [name, node] of parsed.images) {
      const entries = this.index.images.get(name) ?? [];
      entries.push({ file: fileName, node });
      this.index.images.set(name, entries);
    }

    // Index transforms
    for (const [name, node] of parsed.transforms) {
      this.index.transforms.set(name, { file: fileName, node });
    }

    // Index defines/defaults as variables
    for (const [name, node] of parsed.defines) {
      this.index.variables.set(name, { file: fileName, node });
    }
    for (const [name, node] of parsed.defaults) {
      this.index.variables.set(name, { file: fileName, node });
    }

    // Index testcases
    for (const [name, node] of parsed.testcases) {
      this.index.testcases.set(name, { file: fileName, node });
    }

    this._onDidUpdate.fire(this.index);
    return parsed;
  }

  /**
   * Remove a file from the index.
   */
  removeFile(fileName: string): void {
    this.removeFileFromIndex(fileName);
    this._onDidUpdate.fire(this.index);
  }

  private removeFileFromIndex(fileName: string): void {
    this.index.files.delete(fileName);

    // Clean labels
    for (const [name, entries] of this.index.labels) {
      const filtered = entries.filter(e => e.file !== fileName);
      if (filtered.length === 0) {
        this.index.labels.delete(name);
      } else {
        this.index.labels.set(name, filtered);
      }
    }

    // Clean screens
    for (const [name, entries] of this.index.screens) {
      const filtered = entries.filter(e => e.file !== fileName);
      if (filtered.length === 0) {
        this.index.screens.delete(name);
      } else {
        this.index.screens.set(name, filtered);
      }
    }

    // Clean characters
    for (const [name, entry] of this.index.characters) {
      if (entry.file === fileName) {
        this.index.characters.delete(name);
      }
    }

    // Clean images
    for (const [name, entries] of this.index.images) {
      const filtered = entries.filter(e => e.file !== fileName);
      if (filtered.length === 0) {
        this.index.images.delete(name);
      } else {
        this.index.images.set(name, filtered);
      }
    }

    // Clean transforms
    for (const [name, entry] of this.index.transforms) {
      if (entry.file === fileName) {
        this.index.transforms.delete(name);
      }
    }

    // Clean variables
    for (const [name, entry] of this.index.variables) {
      if (entry.file === fileName) {
        this.index.variables.delete(name);
      }
    }

    // Clean testcases
    for (const [name, entry] of this.index.testcases) {
      if (entry.file === fileName) {
        this.index.testcases.delete(name);
      }
    }
  }

  /**
   * Scan game/ directory for asset files.
   */
  private async indexAssetFiles(): Promise<void> {
    const patterns = ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.webp', '**/*.ogg', '**/*.mp3', '**/*.wav', '**/*.opus', '**/*.mp4', '**/*.webm', '**/*.ogv'];
    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(pattern, '{**/node_modules/**,**/.git/**}');
      for (const file of files) {
        const rel = vscode.workspace.asRelativePath(file);
        this.index.assetFiles.add(rel);
      }
    }
  }

  private createEmptyIndex(): ProjectIndex {
    return {
      files: new Map(),
      labels: new Map(),
      screens: new Map(),
      characters: new Map(),
      images: new Map(),
      transforms: new Map(),
      variables: new Map(),
      testcases: new Map(),
      assetFiles: new Set(),
    };
  }

  dispose(): void {
    this._onDidUpdate.dispose();
  }
}
