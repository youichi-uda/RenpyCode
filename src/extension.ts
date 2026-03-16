/**
 * RenPy Code — Ren'Py Development Suite for VS Code
 *
 * Main extension entry point. Registers all providers and commands.
 *
 * FREE features:
 *   - Syntax highlighting (TextMate grammar), Semantic tokens
 *   - Autocompletion, Hover docs, Signature help
 *   - Go-to-definition, Find all references, Call hierarchy
 *   - Document/workspace symbols, CodeLens, Inlay hints
 *   - Diagnostics, Code actions (quick fixes), Document links
 *   - Color picker, Code folding, Bracket matching
 *   - Game launch, lint, warp
 *   - Snippets (via package.json)
 *
 * PRO features (license key required):
 *   - Debugger (DAP), Rename (refactoring)
 *   - Story flow graph, Live preview, Variable tracker
 *   - Heatmap, Asset manager, Translation dashboard
 *   - Extract route, Test runner
 */

import * as vscode from 'vscode';
import { RenpyCompletionProvider } from './language/completion-provider';
import { RenpyHoverProvider } from './language/hover-provider';
import { RenpyDiagnosticsProvider, DiagnosticsConfig } from './language/diagnostics';
import { RenpyDefinitionProvider, RenpyReferenceProvider } from './language/definition-provider';
import { RenpyDocumentSymbolProvider, RenpyWorkspaceSymbolProvider } from './language/symbol-provider';
import { RenpyColorProvider } from './language/color-provider';
import { RenpyFoldingProvider } from './language/folding-provider';
import { RenpyCodeLensProvider } from './language/codelens-provider';
import { RenpySemanticTokensProvider, SEMANTIC_TOKENS_LEGEND } from './language/semantic-tokens-provider';
import { RenpyCallHierarchyProvider } from './language/callhierarchy-provider';
import { RenpyCodeActionProvider } from './language/codeaction-provider';
import { RenpyInlayHintsProvider } from './language/inlayhint-provider';
import { RenpyLinkProvider } from './language/link-provider';
import { RenpySignatureProvider } from './language/signature-provider';
import { RenpyBracketHighlightProvider } from './language/bracket-provider';
import { RenpyRenameProvider } from './language/rename-provider';
import { registerVariableTracker } from './language/variable-tracker';
import { PreviewProvider } from './language/preview-provider';
import { ProjectIndexer } from './analyzer/project-indexer';
import { LicenseManager } from './license/license-manager';
import { RenpyRunner } from './runner/renpy-runner';
import { BridgeManager } from './bridge/bridge-manager';
import { FlowGraphProvider } from './flow-graph/flow-graph-provider';
import { DashboardProvider } from './dashboard/dashboard-provider';
import { HeatmapProvider } from './heatmap/heatmap-provider';
import { AssetProvider } from './assets/asset-provider';
import { TranslationProvider } from './translation/translation-provider';
import { TestRunnerProvider } from './test-runner/test-runner';
import { RefactorProvider } from './refactor/refactor-provider';
import { RenpyDebugSession } from './debugger/debug-adapter';
import { localize } from './language/i18n';
import { ProjectProfiler } from './profiler/profiler';

const LANGUAGE_ID = 'renpy';

export function activate(context: vscode.ExtensionContext): void {
  console.log('RenPy Code activating...');

  // Signal that a Ren'Py project is detected
  vscode.commands.executeCommand('setContext', 'renpyCode.projectDetected', true);

  // ── Core services ──
  const licenseManager = new LicenseManager();
  licenseManager.initialize(context);

  const indexer = new ProjectIndexer();
  const getIndex = () => indexer.getIndex();

  const runner = new RenpyRunner();
  const bridge = new BridgeManager();
  runner.setBridge(bridge);

  // Set up bridge with project root
  const projectRoot = runner.getProjectRoot();
  if (projectRoot) {
    bridge.setProjectRoot(projectRoot);
    bridge.startPolling();
  }

  const getDiagConfig = (): DiagnosticsConfig => {
    const config = vscode.workspace.getConfiguration('renpyCode.diagnostics');
    return {
      enable: config.get('enable', true),
      undefinedLabel: config.get('undefinedLabel', true),
      undefinedCharacter: config.get('undefinedCharacter', true),
      invalidJump: config.get('invalidJump', true),
      indentation: config.get('indentation', true),
      unusedLabel: config.get('unusedLabel', true),
      missingResource: config.get('missingResource', true),
      unreachableCode: config.get('unreachableCode', true),
    };
  };

  const diagnostics = new RenpyDiagnosticsProvider(getIndex, getDiagConfig);

  // ── Dashboard (sidebar WebView) ──
  const dashboard = new DashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardProvider.viewType, dashboard),
  );

  const updateDashboardStats = () => {
    const idx = indexer.getIndex();
    dashboard.updateStats(idx.files.size, idx.labels.size, idx.characters.size, idx.variables.size);
  };

  dashboard.updateLicense(licenseManager.isProLicensed);
  licenseManager.onDidChange((isValid) => dashboard.updateLicense(isValid));

  // Update bridge status on dashboard
  bridge.onStateChanged((state) => {
    dashboard.updateBridge(state.connected, state.label || '');
  });

  // ══════════════════════════════════════════════════════════
  //  FREE: Language Providers
  // ══════════════════════════════════════════════════════════

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: LANGUAGE_ID },
      new RenpyCompletionProvider(getIndex),
      ' ', '"', "'",
    ),
    vscode.languages.registerHoverProvider(
      { language: LANGUAGE_ID },
      new RenpyHoverProvider(getIndex),
    ),
    vscode.languages.registerDefinitionProvider(
      { language: LANGUAGE_ID },
      new RenpyDefinitionProvider(getIndex),
    ),
    vscode.languages.registerReferenceProvider(
      { language: LANGUAGE_ID },
      new RenpyReferenceProvider(getIndex),
    ),
    vscode.languages.registerDocumentSymbolProvider(
      { language: LANGUAGE_ID },
      new RenpyDocumentSymbolProvider(getIndex),
    ),
    vscode.languages.registerWorkspaceSymbolProvider(
      new RenpyWorkspaceSymbolProvider(getIndex),
    ),
    vscode.languages.registerColorProvider(
      { language: LANGUAGE_ID },
      new RenpyColorProvider(),
    ),
    vscode.languages.registerFoldingRangeProvider(
      { language: LANGUAGE_ID },
      new RenpyFoldingProvider(),
    ),
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: LANGUAGE_ID },
      new RenpySemanticTokensProvider(getIndex),
      SEMANTIC_TOKENS_LEGEND,
    ),
    vscode.languages.registerCallHierarchyProvider(
      { language: LANGUAGE_ID },
      new RenpyCallHierarchyProvider(getIndex),
    ),
    vscode.languages.registerCodeActionsProvider(
      { language: LANGUAGE_ID, scheme: 'file' },
      new RenpyCodeActionProvider(getIndex),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    vscode.languages.registerInlayHintsProvider(
      { language: LANGUAGE_ID },
      new RenpyInlayHintsProvider(getIndex),
    ),
    vscode.languages.registerDocumentLinkProvider(
      { language: LANGUAGE_ID },
      new RenpyLinkProvider(),
    ),
    vscode.languages.registerSignatureHelpProvider(
      { language: LANGUAGE_ID },
      new RenpySignatureProvider(getIndex),
      '(', ',',
    ),
    vscode.languages.registerDocumentHighlightProvider(
      { language: LANGUAGE_ID },
      new RenpyBracketHighlightProvider(),
    ),
  );

  // CodeLens
  const codeLensProvider = new RenpyCodeLensProvider(getIndex);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: LANGUAGE_ID },
      codeLensProvider,
    ),
  );

  // Rename (Pro)
  context.subscriptions.push(
    vscode.languages.registerRenameProvider(
      { language: LANGUAGE_ID },
      new RenpyRenameProvider(getIndex, licenseManager),
    ),
  );

  // Variable tracker tree view
  const variableTracker = registerVariableTracker(context, getIndex, bridge);

  // ── Diagnostics lifecycle ──
  context.subscriptions.push(diagnostics.collection);

  const analyzeDocument = (document: vscode.TextDocument) => {
    if (document.languageId !== LANGUAGE_ID) return;
    indexer.indexDocument(document);
    diagnostics.analyzeDocument(document);
    codeLensProvider.refresh();
    updateDashboardStats();
  };

  vscode.workspace.textDocuments.forEach(analyzeDocument);
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => analyzeDocument(e.document)),
    vscode.workspace.onDidOpenTextDocument(analyzeDocument),
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.languageId === LANGUAGE_ID) {
        diagnostics.collection.delete(doc.uri);
      }
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('renpyCode.license.key')) {
        licenseManager.onLicenseKeyChanged();
      }
      if (e.affectsConfiguration('renpyCode')) {
        vscode.workspace.textDocuments.forEach(analyzeDocument);
      }
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  FREE: Commands
  // ══════════════════════════════════════════════════════════

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.analyzeProject', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('RenPy Code: Indexing project...') },
        async () => {
          await indexer.indexWorkspace();
          updateDashboardStats();
          const idx = indexer.getIndex();
          vscode.window.showInformationMessage(
            vscode.l10n.t(
              'RenPy Code: Indexed {0} files, {1} labels, {2} characters, {3} variables.',
              idx.files.size, idx.labels.size, idx.characters.size, idx.variables.size,
            ),
          );
        },
      );
    }),
    vscode.commands.registerCommand('renpyCode.launchGame', () => {
      const projectRoot = runner.getProjectRoot();
      if (projectRoot) {
        bridge.installBridge(context.extensionPath, projectRoot);
        bridge.setProjectRoot(projectRoot);
        bridge.startPolling();
      }
      runner.launchGame();
    }),
    vscode.commands.registerCommand('renpyCode.killGame', () => runner.killGame()),
    vscode.commands.registerCommand('renpyCode.lint', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'RenPy Code: Running lint...' },
        async () => {
          const output = await runner.runLint();
          if (output) {
            const ch = vscode.window.createOutputChannel('RenPy Lint');
            ch.clear();
            ch.appendLine(output);
            ch.show();
          }
        },
      );
    }),
    vscode.commands.registerCommand('renpyCode.warpToLine', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const fileName = vscode.workspace.asRelativePath(editor.document.uri);
      const gamePath = fileName.replace(/^game[/\\]/, '');
      const line = editor.selection.active.line + 1;
      await runner.warpTo(`${gamePath}:${line}`);
      previewProvider.refreshAfterWarp();
    }),
    vscode.commands.registerCommand('renpyCode.warpToLabel', async () => {
      const idx = indexer.getIndex();
      let labels = [...idx.labels.keys()];
      if (labels.length === 0) {
        await indexer.indexWorkspace();
        labels = [...indexer.getIndex().labels.keys()];
      }
      const selected = await vscode.window.showQuickPick(labels, {
        placeHolder: vscode.l10n.t('Select a label to warp to'),
      });
      if (selected) {
        const entries = idx.labels.get(selected);
        if (entries && entries.length > 0) {
          const gamePath = entries[0].file.replace(/^game[/\\]/, '');
          await runner.warpTo(`${gamePath}:${entries[0].node.line + 1}`);
          previewProvider.refreshAfterWarp();
        }
      }
    }),
    vscode.commands.registerCommand('renpyCode.goToDefinition', () => {
      vscode.commands.executeCommand('editor.action.revealDefinition');
    }),
    vscode.commands.registerCommand('renpyCode.findAllReferences', () => {
      vscode.commands.executeCommand('editor.action.goToReferences');
    }),
    vscode.commands.registerCommand('renpyCode.activateLicense', () => {
      licenseManager.activateLicense();
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  PRO: Flow Graph
  // ══════════════════════════════════════════════════════════

  const flowGraphProvider = new FlowGraphProvider(getIndex, context.extensionUri);

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.showFlowGraph', async () => {
      if (!(await licenseManager.requirePro('flow-graph'))) return;

      if (indexer.getIndex().files.size === 0) {
        await indexer.indexWorkspace();
      }

      const graph = flowGraphProvider.buildGraph();
      if (graph.nodes.length === 0) {
        vscode.window.showWarningMessage(vscode.l10n.t('Flow Graph: No labels found.'));
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        'renpyCode.flowGraph',
        localize('RenPy Code: Story Flow Graph', 'RenPy Code: ストーリーフローグラフ'),
        vscode.ViewColumn.Beside,
        { enableScripts: true },
      );

      panel.webview.html = flowGraphProvider.renderHtml(graph, panel.webview);

      panel.webview.onDidReceiveMessage(msg => {
        if (msg.type === 'navigate') {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (workspaceFolder) {
            const uri = vscode.Uri.joinPath(workspaceFolder.uri, msg.file);
            vscode.window.showTextDocument(uri, {
              selection: new vscode.Range(msg.line, 0, msg.line, 0),
              viewColumn: vscode.ViewColumn.One,
            });
          }
        }
        if (msg.type === 'warp') {
          const gamePath = msg.file.replace(/^game[/\\]/, '');
          runner.warpTo(`${gamePath}:${msg.line + 1}`).then(() => {
            previewProvider.refreshAfterWarp();
          });
        }
      });
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  PRO: Debugger (DAP)
  // ══════════════════════════════════════════════════════════

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('renpy', {
      provideDebugConfigurations(): vscode.DebugConfiguration[] {
        return [
          {
            type: 'renpy',
            request: 'launch',
            name: "Debug Ren'Py",
            gameRoot: '${workspaceFolder}',
          },
        ];
      },
      async resolveDebugConfiguration(
        _folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken,
      ): Promise<vscode.DebugConfiguration | undefined> {
        // F5 with no launch.json: config has no type set
        if (!config.type) {
          config.type = 'renpy';
          config.request = 'launch';
          config.name = "Debug Ren'Py";
        }
        if (!licenseManager.isProLicensed) {
          await licenseManager.requirePro('debugger');
          if (!licenseManager.isProLicensed) return undefined;
        }
        if (!config.gameRoot) {
          config.gameRoot = runner.getProjectRoot() || '${workspaceFolder}';
        }
        if (!config.sdkPath) {
          config.sdkPath = vscode.workspace.getConfiguration('renpyCode').get<string>('sdkPath', '');
        }
        // Install MCP bridge for live features during debug
        // config.gameRoot may contain unresolved ${workspaceFolder} — fall back to runner
        const resolvedGameRoot = (config.gameRoot && !String(config.gameRoot).includes('${'))
          ? String(config.gameRoot)
          : runner.getProjectRoot();
        if (resolvedGameRoot) {
          bridge.installBridge(context.extensionPath, resolvedGameRoot);
          bridge.setProjectRoot(resolvedGameRoot);
          bridge.startPolling();
        }
        return config;
      },
    }),
    vscode.debug.registerDebugAdapterDescriptorFactory('renpy', {
      createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        return new vscode.DebugAdapterInlineImplementation(new RenpyDebugSession());
      },
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  PRO: Live Preview
  // ══════════════════════════════════════════════════════════

  const previewProvider = new PreviewProvider(bridge, context.extensionUri);

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.showPreview', async () => {
      if (!(await licenseManager.requirePro('live-preview'))) return;
      await previewProvider.showPreview();
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  PRO: Heatmap
  // ══════════════════════════════════════════════════════════

  const heatmapProvider = new HeatmapProvider(bridge, getIndex);

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.showHeatmap', async () => {
      if (!(await licenseManager.requirePro('live-preview'))) return;
      await heatmapProvider.show();
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  PRO: Asset Manager
  // ══════════════════════════════════════════════════════════

  const assetProvider = new AssetProvider(getIndex);

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.showAssets', async () => {
      if (!(await licenseManager.requirePro('live-preview'))) return;
      await assetProvider.show();
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  PRO: Translation Dashboard
  // ══════════════════════════════════════════════════════════

  const translationProvider = new TranslationProvider();

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.showTranslation', async () => {
      if (!(await licenseManager.requirePro('live-preview'))) return;
      await translationProvider.show();
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  PRO: Test Runner
  // ══════════════════════════════════════════════════════════

  const testRunnerProvider = new TestRunnerProvider(getIndex, runner);

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.runAllTests', async () => {
      if (!(await licenseManager.requirePro('auto-test'))) return;
      await testRunnerProvider.runAllTests();
    }),
    vscode.commands.registerCommand('renpyCode.runTest', async () => {
      if (!(await licenseManager.requirePro('auto-test'))) return;
      await testRunnerProvider.pickAndRunTest();
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  PRO: Refactoring Commands
  // ══════════════════════════════════════════════════════════

  const refactorProvider = new RefactorProvider(getIndex);

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.extractRoute', async () => {
      if (!(await licenseManager.requirePro('refactoring'))) return;
      await refactorProvider.extractRoute();
    }),
    vscode.commands.registerCommand('renpyCode.insertDialogue', async () => {
      await refactorProvider.insertDialogue();
    }),
    vscode.commands.registerCommand('renpyCode.renameSymbol', () => {
      vscode.commands.executeCommand('editor.action.rename');
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  PRO: Performance Profiler
  // ══════════════════════════════════════════════════════════

  const profiler = new ProjectProfiler(getIndex);

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.profileProject', async () => {
      if (!(await licenseManager.requirePro('profiler'))) return;

      if (indexer.getIndex().files.size === 0) {
        await indexer.indexWorkspace();
      }

      profiler.profileAndShow();
    }),
  );

  // ══════════════════════════════════════════════════════════
  //  Cleanup
  // ══════════════════════════════════════════════════════════

  context.subscriptions.push(
    { dispose: () => licenseManager.dispose() },
    { dispose: () => indexer.dispose() },
    { dispose: () => diagnostics.dispose() },
    { dispose: () => runner.dispose() },
    { dispose: () => bridge.dispose() },
    { dispose: () => previewProvider.dispose() },
    { dispose: () => heatmapProvider.dispose() },
    { dispose: () => assetProvider.dispose() },
    { dispose: () => translationProvider.dispose() },
    { dispose: () => testRunnerProvider.dispose() },
    { dispose: () => variableTracker.dispose() },
  );

  // ── Initial workspace index ──
  indexer.indexWorkspace().then(() => {
    updateDashboardStats();
    vscode.workspace.textDocuments.forEach(analyzeDocument);
  });

  // ── Status bar ──
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  const updateStatusBar = (isValid: boolean) => {
    statusBar.text = isValid ? '$(star-full) RenPy Code Pro' : '$(code) RenPy Code';
    statusBar.tooltip = isValid
      ? vscode.l10n.t('RenPy Code Pro — All features unlocked')
      : vscode.l10n.t('RenPy Code Free — Click to activate Pro license');
    statusBar.command = isValid ? undefined : 'renpyCode.activateLicense';
  };
  updateStatusBar(licenseManager.isProLicensed);
  statusBar.show();
  context.subscriptions.push(statusBar);
  licenseManager.onDidChange(updateStatusBar);

  // Bridge status bar
  const bridgeStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 49);
  bridge.onStateChanged((state) => {
    if (state.connected) {
      bridgeStatus.text = `$(plug) ${state.label || 'Connected'}`;
      bridgeStatus.tooltip = 'Ren\'Py bridge connected';
    } else {
      bridgeStatus.text = '$(debug-disconnect) Bridge';
      bridgeStatus.tooltip = 'Ren\'Py bridge disconnected';
    }
  });
  bridgeStatus.show();
  context.subscriptions.push(bridgeStatus);

  console.log('RenPy Code activated successfully.');
}

export function deactivate(): void {
  console.log('RenPy Code deactivated.');
}
