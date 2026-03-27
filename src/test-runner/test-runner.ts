/**
 * Ren'Py test runner (Pro feature).
 * Discovers and runs testcase definitions via Ren'Py's built-in test framework.
 * Ported from MCP run_test / create_test / list_tests.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectIndex } from '../parser/types';
import { RenpyRunner } from '../runner/renpy-runner';
import { localize } from '../language/i18n';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  output: string;
}

export class TestRunnerProvider {
  private _outputChannel: vscode.OutputChannel;

  constructor(
    private getIndex: () => ProjectIndex,
    private runner: RenpyRunner,
  ) {
    this._outputChannel = vscode.window.createOutputChannel('RenPy Tests');
  }

  /**
   * List all testcases in the project.
   */
  listTests(): string[] {
    const index = this.getIndex();
    return [...index.testcases.keys()];
  }

  /**
   * Run a specific testcase.
   */
  async runTest(testName: string): Promise<TestResult> {
    const sdkPath = this.runner.getSDKPath();
    const projectRoot = this.runner.getProjectRoot();

    if (!sdkPath || !projectRoot) {
      if (!sdkPath) {
        const openSettings = vscode.l10n.t('Open Settings');
        vscode.window.showErrorMessage(
          vscode.l10n.t('No Ren\'Py SDK found. Please set renpyCode.sdkPath in settings.'),
          openSettings,
        ).then(selection => {
          if (selection === openSettings) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'renpyCode.sdkPath');
          }
        });
      }
      return { name: testName, passed: false, duration: 0, output: localize('SDK or project not found.', 'SDKまたはプロジェクトが見つかりません。') };
    }

    this._outputChannel.appendLine(`\n--- Running test: ${testName} ---`);
    this._outputChannel.show();

    const startTime = Date.now();

    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const path = require('path');
      const fs = require('fs');

      let exe: string;
      if (process.platform === 'win32') {
        exe = path.join(sdkPath, 'renpy.exe');
        if (!fs.existsSync(exe)) exe = path.join(sdkPath, 'renpy.py');
      } else {
        exe = path.join(sdkPath, 'renpy.sh');
      }

      const args = [projectRoot, 'test', testName];
      let output = '';
      let errorOutput = '';

      const spawnOpts = {
        cwd: sdkPath,
        stdio: ['ignore', 'pipe', 'pipe'] as const,
        ...(process.platform === 'win32' ? { windowsHide: true } : {}),
      };

      let proc;
      if (exe.endsWith('.py')) {
        const pythonExe = path.join(sdkPath, 'lib', 'py3-windows-x86_64', 'python.exe');
        if (fs.existsSync(pythonExe)) {
          proc = spawn(pythonExe, [exe, ...args], spawnOpts);
        } else {
          proc = spawn('python', [exe, ...args], spawnOpts);
        }
      } else {
        proc = spawn(exe, args, spawnOpts);
      }

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        this._outputChannel.append(text);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
        this._outputChannel.append(text);
      });

      proc.on('close', (code: number | null) => {
        const duration = Date.now() - startTime;
        const passed = code === 0;
        const fullOutput = output + errorOutput;

        this._outputChannel.appendLine(`\n--- Test ${testName}: ${passed ? 'PASSED' : 'FAILED'} (${duration}ms) ---`);

        resolve({ name: testName, passed, duration, output: fullOutput });
      });

      proc.on('error', (err: Error) => {
        resolve({ name: testName, passed: false, duration: 0, output: err.message });
      });

      // Timeout after 120 seconds
      setTimeout(() => {
        proc.kill();
        resolve({ name: testName, passed: false, duration: 120000, output: localize('Test timed out.', 'テストがタイムアウトしました。') });
      }, 120000);
    });
  }

  /**
   * Create a new testcase snippet in a .rpy file.
   * If there's an active .rpy editor, uses that file; otherwise looks for
   * game/script.rpy or any .rpy file in the game/ directory.
   */
  async createTestcase(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    let targetUri: vscode.Uri | undefined;

    if (activeEditor && activeEditor.document.fileName.endsWith('.rpy')) {
      targetUri = activeEditor.document.uri;
    } else {
      const projectRoot = this.runner.getProjectRoot();
      if (!projectRoot) {
        vscode.window.showErrorMessage(localize('No Ren\'Py project found.', 'Ren\'Pyプロジェクトが見つかりません。'));
        return;
      }

      const scriptPath = path.join(projectRoot, 'game', 'script.rpy');
      const fs = require('fs');
      if (fs.existsSync(scriptPath)) {
        targetUri = vscode.Uri.file(scriptPath);
      } else {
        const gameDir = path.join(projectRoot, 'game');
        const rpyFiles = await vscode.workspace.findFiles(
          new vscode.RelativePattern(gameDir, '**/*.rpy'),
          undefined,
          1,
        );
        if (rpyFiles.length > 0) {
          targetUri = rpyFiles[0];
        }
      }
    }

    if (!targetUri) {
      vscode.window.showErrorMessage(localize('No .rpy file found to insert testcase.', 'テストケースを挿入する.rpyファイルが見つかりません。'));
      return;
    }

    const doc = await vscode.workspace.openTextDocument(targetUri);
    const editor = await vscode.window.showTextDocument(doc);

    // Move cursor to end of file with a blank line separator
    const lastLine = doc.lineCount - 1;
    const lastChar = doc.lineAt(lastLine).text.length;
    const endPos = new vscode.Position(lastLine, lastChar);
    editor.selection = new vscode.Selection(endPos, endPos);

    const prefix = doc.getText().endsWith('\n') ? '\n' : '\n\n';
    const snippet = new vscode.SnippetString(
      `${prefix}testcase \${1:my_test}:\n    "\${2:Click to continue.}"\n    click\n`,
    );
    await editor.insertSnippet(snippet, endPos);
  }

  /**
   * Run all testcases and show results.
   */
  async runAllTests(): Promise<void> {
    const tests = this.listTests();

    if (tests.length === 0) {
      const createAction = localize('Create Testcase', 'テストケースを作成');
      const selection = await vscode.window.showWarningMessage(
        vscode.l10n.t('No testcases found in the project.'),
        createAction,
      );
      if (selection === createAction) {
        await this.createTestcase();
      }
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Running Ren\'Py tests...'),
        cancellable: true,
      },
      async (progress, token) => {
        let passed = 0;
        let failed = 0;

        for (let i = 0; i < tests.length; i++) {
          if (token.isCancellationRequested) break;

          const test = tests[i];
          progress.report({
            message: `${test} (${i + 1}/${tests.length})`,
            increment: (100 / tests.length),
          });

          const result = await this.runTest(test);
          if (result.passed) {
            passed++;
          } else {
            failed++;
          }
        }

        const resultMsg = vscode.l10n.t('Tests complete: {0} passed, {1} failed ({2} total)', passed, failed, tests.length);
        if (failed > 0) {
          vscode.window.showWarningMessage(resultMsg);
        } else {
          vscode.window.showInformationMessage(resultMsg);
        }
      },
    );
  }

  /**
   * Show test picker and run selected test.
   */
  async pickAndRunTest(): Promise<void> {
    const tests = this.listTests();
    if (tests.length === 0) {
      const createAction = localize('Create Testcase', 'テストケースを作成');
      const selection = await vscode.window.showWarningMessage(
        vscode.l10n.t('No testcases found.'),
        createAction,
      );
      if (selection === createAction) {
        await this.createTestcase();
      }
      return;
    }

    const selected = await vscode.window.showQuickPick(tests, {
      placeHolder: vscode.l10n.t('Select a testcase to run'),
    });

    if (selected) {
      await this.runTest(selected);
    }
  }

  dispose(): void {
    this._outputChannel.dispose();
  }
}
