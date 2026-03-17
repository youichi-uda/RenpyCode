/**
 * Minimal vscode mock for unit tests.
 */

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(
    public readonly startLine: number,
    public readonly startCharacter: number,
    public readonly endLine: number,
    public readonly endCharacter: number,
  ) {}
  get start() { return new Position(this.startLine, this.startCharacter); }
  get end() { return new Position(this.endLine, this.endCharacter); }
}

export class Uri {
  constructor(public readonly fsPath: string, public readonly scheme: string = 'file') {}
  static file(p: string) { return new Uri(p); }
  static joinPath(base: Uri, ...paths: string[]) { return new Uri(base.fsPath + '/' + paths.join('/')); }
  toString() { return this.fsPath; }
}

export class MarkdownString {
  value = '';
  supportHtml = false;
  isTrusted = false;
  appendCodeblock(code: string, lang?: string) { this.value += `\`\`\`${lang || ''}\n${code}\n\`\`\`\n`; }
  appendMarkdown(md: string) { this.value += md; }
}

export class Hover {
  constructor(public contents: MarkdownString | string, public range?: Range) {}
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

export enum SymbolKind {
  Function = 11,
  Variable = 12,
  Class = 4,
  File = 0,
  Event = 8,
  Property = 6,
  Method = 5,
  Namespace = 2,
  Enum = 9,
}

export class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(
    public name: string,
    public detail: string,
    public kind: SymbolKind,
    public range: Range,
    public selectionRange: Range,
  ) {}
}

export class SymbolInformation {
  constructor(
    public name: string,
    public kind: SymbolKind,
    public containerName: string,
    public location: { uri: Uri; range: Range },
  ) {}
}

export enum CompletionItemKind {
  Text = 0, Method = 1, Function = 2, Constructor = 3, Field = 4,
  Variable = 5, Class = 6, Interface = 7, Module = 8, Property = 9,
  Unit = 10, Value = 11, Enum = 12, Keyword = 13, Snippet = 14,
  Color = 15, Reference = 17, File = 16, Folder = 18, Event = 22,
  Struct = 21, Constant = 20,
}

export class CompletionItem {
  documentation?: MarkdownString;
  detail?: string;
  insertText?: SnippetString | string;
  filterText?: string;
  sortText?: string;
  constructor(
    public label: string | { label: string; description?: string },
    public kind: CompletionItemKind = CompletionItemKind.Text,
  ) {}
}

export class SnippetString {
  constructor(public value: string = '') {}
}

export class CompletionList {
  constructor(
    public items: CompletionItem[] = [],
    public isIncomplete: boolean = false,
  ) {}
}

export enum CodeActionKind {
  QuickFix = 'quickfix',
}

export class CodeAction {
  edit?: WorkspaceEdit;
  constructor(public title: string, public kind?: CodeActionKind) {}
}

export class WorkspaceEdit {
  private _edits: { uri: Uri; range: Range; newText: string }[] = [];
  replace(uri: Uri, range: Range, newText: string) { this._edits.push({ uri, range, newText }); }
  insert(uri: Uri, position: Position, newText: string) {
    this._edits.push({ uri, range: new Range(position.line, position.character, position.line, position.character), newText });
  }
  get size() { return this._edits.length; }
  entries() { return this._edits; }
}

export class FoldingRange {
  constructor(
    public start: number,
    public end: number,
    public kind?: number,
  ) {}
}

export enum FoldingRangeKind {
  Comment = 1,
  Imports = 2,
  Region = 3,
}

export class Location {
  constructor(public uri: Uri, public range: Range) {}
}

export class EventEmitter<T = void> {
  private _listeners: ((e: T) => void)[] = [];
  event = (listener: (e: T) => void) => {
    this._listeners.push(listener);
    return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
  };
  fire(data: T) { this._listeners.forEach(l => l(data)); }
  dispose() { this._listeners = []; }
}

export const env = {
  language: 'en',
};

export const languages = {
  createDiagnosticCollection: (name: string) => ({
    name,
    _map: new Map<string, Diagnostic[]>(),
    set(uri: Uri, diags: Diagnostic[]) { this._map.set(uri.toString(), diags); },
    delete(uri: Uri) { this._map.delete(uri.toString()); },
    get(uri: Uri) { return this._map.get(uri.toString()); },
    dispose() { this._map.clear(); },
  }),
};

export const workspace = {
  workspaceFolders: [],
  getConfiguration: () => ({ get: (key: string, def: any) => def }),
  asRelativePath: (uri: Uri | string) => typeof uri === 'string' ? uri : uri.fsPath,
  findFiles: async () => [],
  onDidChangeTextDocument: () => ({ dispose() {} }),
  onDidOpenTextDocument: () => ({ dispose() {} }),
  onDidCloseTextDocument: () => ({ dispose() {} }),
  onDidChangeConfiguration: () => ({ dispose() {} }),
  textDocuments: [],
};

export const window = {
  activeTextEditor: undefined,
  showInformationMessage: () => {},
  showWarningMessage: () => {},
  showErrorMessage: () => {},
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
  createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, clear() {}, dispose() {} }),
  createWebviewPanel: () => ({
    webview: { html: '', onDidReceiveMessage: () => ({ dispose() {} }) },
    reveal() {},
    onDidDispose: () => ({ dispose() {} }),
    dispose() {},
  }),
  withProgress: async (_opts: any, fn: any) => fn({ report() {} }, { isCancellationRequested: false }),
  createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {}, text: '', tooltip: '' }),
  registerWebviewViewProvider: () => ({ dispose() {} }),
};

export const commands = {
  executeCommand: async () => {},
  registerCommand: () => ({ dispose() {} }),
};

export const debug = {
  registerDebugConfigurationProvider: () => ({ dispose() {} }),
  registerDebugAdapterDescriptorFactory: () => ({ dispose() {} }),
};

export const l10n = {
  t: (msg: string, ...args: any[]) => {
    let result = msg;
    args.forEach((arg, i) => { result = result.replace(`{${i}}`, String(arg)); });
    return result;
  },
};

export enum ViewColumn {
  One = 1,
  Two = 2,
  Beside = -2,
}

export enum ProgressLocation {
  Notification = 15,
}

export class StatusBarAlignment {
  static Left = 1;
  static Right = 2;
}

export class CancellationTokenSource {
  token = { isCancellationRequested: false };
  cancel() { this.token.isCancellationRequested = true; }
  dispose() {}
}

export enum InlayHintKind {
  Type = 1,
  Parameter = 2,
}

export class InlayHint {
  paddingLeft?: boolean;
  paddingRight?: boolean;
  constructor(public position: Position, public label: string, public kind?: InlayHintKind) {}
}

export class DocumentLink {
  constructor(public range: Range, public target?: Uri) {}
}

export class Color {
  constructor(
    public readonly red: number,
    public readonly green: number,
    public readonly blue: number,
    public readonly alpha: number,
  ) {}
}

export class ColorInformation {
  constructor(public range: Range, public color: Color) {}
}

export class ColorPresentation {
  textEdit?: TextEdit;
  constructor(public label: string) {}
}

export class TextEdit {
  constructor(public range: Range, public newText: string) {}
  static replace(range: Range, newText: string) { return new TextEdit(range, newText); }
  static delete(range: Range) { return new TextEdit(range, ''); }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  iconPath?: ThemeIcon;
  description?: string;
  tooltip?: string;
  command?: any;
  collapsibleState: TreeItemCollapsibleState;
  constructor(label: string, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
  label: string;
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export class SignatureHelp {
  signatures: SignatureInformation[] = [];
  activeSignature = 0;
  activeParameter = 0;
}

export class SignatureInformation {
  parameters: ParameterInformation[] = [];
  constructor(public label: string, public documentation?: string) {}
}

export class ParameterInformation {
  constructor(public label: string | [number, number], public documentation?: string) {}
}

export class CallHierarchyItem {
  constructor(
    public kind: SymbolKind,
    public name: string,
    public detail: string,
    public uri: Uri,
    public range: Range,
    public selectionRange: Range,
  ) {}
}

export class CallHierarchyIncomingCall {
  constructor(public from: CallHierarchyItem, public fromRanges: Range[]) {}
}

export class CallHierarchyOutgoingCall {
  constructor(public to: CallHierarchyItem, public fromRanges: Range[]) {}
}

export class SemanticTokensBuilder {
  private _data: number[] = [];
  push(line: number, char: number, length: number, tokenType: number, tokenModifiers: number) {
    this._data.push(line, char, length, tokenType, tokenModifiers);
  }
  build() { return { data: new Uint32Array(this._data) }; }
}

export class SemanticTokensLegend {
  constructor(public tokenTypes: string[], public tokenModifiers: string[] = []) {}
}

export class DocumentHighlight {
  constructor(public range: Range) {}
}

export const RelativePattern = class {
  constructor(public base: any, public pattern: string) {}
};

export class CodeLens {
  constructor(public range: Range, public command?: { title: string; command: string; arguments?: any[] }) {}
}

export class DebugAdapterInlineImplementation {
  constructor(public session: any) {}
}
