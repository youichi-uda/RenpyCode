/**
 * Ren'Py test runner (Pro feature).
 * Discovers and runs testcase definitions via Ren'Py's built-in test framework.
 * Ported from MCP run_test / create_test / list_tests.
 */

import * as vscode from 'vscode';
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
      return { name: testName, passed: false, duration: 0, output: 'SDK or project not found.' };
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

      const args = [projectRoot, '--test', testName];
      let output = '';
      let errorOutput = '';

      const proc = spawn(exe, args, {
        cwd: sdkPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(process.platform === 'win32' ? { windowsHide: true } : {}),
      });

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
        resolve({ name: testName, passed: false, duration: 120000, output: 'Test timed out.' });
      }, 120000);
    });
  }

  /**
   * Run all testcases and show results.
   */
  async runAllTests(): Promise<void> {
    const tests = this.listTests();

    if (tests.length === 0) {
      vscode.window.showWarningMessage('No testcases found in the project.');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Running Ren\'Py tests...',
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

        const msg = `Tests complete: ${passed} passed, ${failed} failed (${tests.length} total)`;
        if (failed > 0) {
          vscode.window.showWarningMessage(msg);
        } else {
          vscode.window.showInformationMessage(msg);
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
      vscode.window.showWarningMessage('No testcases found.');
      return;
    }

    const selected = await vscode.window.showQuickPick(tests, {
      placeHolder: 'Select a testcase to run',
    });

    if (selected) {
      await this.runTest(selected);
    }
  }

  dispose(): void {
    this._outputChannel.dispose();
  }
}
