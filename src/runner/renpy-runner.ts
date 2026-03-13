/**
 * Ren'Py subprocess manager.
 * Handles launching games, running lint, warping to specific lines/labels.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { localize } from '../language/i18n';

export class RenpyRunner {
  private gameProcess: ChildProcess | null = null;

  /**
   * Find the Ren'Py SDK path.
   * Checks: 1) Settings  2) RENPY_SDK env var  3) Common locations
   */
  getSDKPath(): string | undefined {
    // From settings
    const configPath = vscode.workspace.getConfiguration('renpyCode').get<string>('sdkPath', '');
    if (configPath && fs.existsSync(configPath)) {
      return configPath;
    }

    // From environment
    const envPath = process.env.RENPY_SDK;
    if (envPath && fs.existsSync(envPath)) {
      return envPath;
    }

    return undefined;
  }

  /**
   * Get the Ren'Py executable path.
   */
  private getRenpyExe(sdkPath: string): string {
    if (process.platform === 'win32') {
      const exe = path.join(sdkPath, 'renpy.exe');
      if (fs.existsSync(exe)) return exe;
      // Fallback to python launcher
      return path.join(sdkPath, 'renpy.py');
    }
    return path.join(sdkPath, 'renpy.sh');
  }

  /**
   * Get the game project root (directory containing 'game/').
   */
  getProjectRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return undefined;

    const root = workspaceFolders[0].uri.fsPath;

    // Check if this directory contains game/
    if (fs.existsSync(path.join(root, 'game'))) {
      return root;
    }

    // Check if this is a game/ directory itself
    if (path.basename(root) === 'game' && fs.existsSync(path.join(root, '..', 'game'))) {
      return path.dirname(root);
    }

    return root;
  }

  /**
   * Launch the Ren'Py game.
   */
  async launchGame(): Promise<void> {
    const sdkPath = this.getSDKPath();
    if (!sdkPath) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('No Ren\'Py SDK found. Please set renpyCode.sdkPath in settings.'),
      );
      return;
    }

    const projectRoot = this.getProjectRoot();
    if (!projectRoot) {
      vscode.window.showErrorMessage('No Ren\'Py project found.');
      return;
    }

    const exe = this.getRenpyExe(sdkPath);
    const args = [projectRoot];

    this.gameProcess = this.spawnRenpy(exe, args, sdkPath);

    this.gameProcess.on('close', () => {
      this.gameProcess = null;
    });

    vscode.window.showInformationMessage(vscode.l10n.t('Game launched successfully.'));
  }

  /**
   * Run Ren'Py lint.
   */
  async runLint(): Promise<string> {
    const sdkPath = this.getSDKPath();
    if (!sdkPath) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('No Ren\'Py SDK found. Please set renpyCode.sdkPath in settings.'),
      );
      return '';
    }

    const projectRoot = this.getProjectRoot();
    if (!projectRoot) {
      vscode.window.showErrorMessage('No Ren\'Py project found.');
      return '';
    }

    const exe = this.getRenpyExe(sdkPath);
    const args = [projectRoot, 'lint', '--json-dump', '-'];

    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';

      const proc = this.spawnRenpy(exe, args, sdkPath, true);

      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString('utf-8');
      });

      proc.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString('utf-8');
      });

      proc.on('close', () => {
        resolve(output || errorOutput);
      });

      proc.on('error', (err) => {
        resolve(`Error: ${err.message}`);
      });

      // Timeout after 60 seconds
      setTimeout(() => {
        proc.kill();
        resolve('Lint timed out after 60 seconds.');
      }, 60000);
    });
  }

  /**
   * Warp to a specific file:line or label.
   */
  async warpTo(target: string): Promise<void> {
    const sdkPath = this.getSDKPath();
    if (!sdkPath) {
      vscode.window.showErrorMessage(
        vscode.l10n.t('No Ren\'Py SDK found. Please set renpyCode.sdkPath in settings.'),
      );
      return;
    }

    const projectRoot = this.getProjectRoot();
    if (!projectRoot) return;

    const exe = this.getRenpyExe(sdkPath);
    const args = [projectRoot, '--warp', target];

    vscode.window.showInformationMessage(vscode.l10n.t('Warping to {0}...', target));

    this.gameProcess = this.spawnRenpy(exe, args, sdkPath);
    this.gameProcess.on('close', () => {
      this.gameProcess = null;
    });
  }

  /**
   * Spawn a Ren'Py subprocess with appropriate flags for the platform.
   * @param captureOutput - If true, pipe stdout/stderr for reading. If false, launch as detached GUI process.
   */
  private spawnRenpy(exe: string, args: string[], sdkPath: string, captureOutput = false): ChildProcess {
    const env = { ...process.env };

    const options: Parameters<typeof spawn>[2] = {
      env,
      cwd: sdkPath,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'ignore',
      detached: !captureOutput,
    };

    // Windows: hide the console window only when capturing output (e.g. lint)
    // For GUI launches, windowsHide must be false so the game window is visible
    if (process.platform === 'win32' && captureOutput) {
      (options as any).windowsHide = true;
    }

    let proc: ChildProcess;

    // Use python on Windows if .exe doesn't exist
    if (exe.endsWith('.py')) {
      const pythonExe = path.join(sdkPath, 'lib', 'py3-windows-x86_64', 'python.exe');
      if (fs.existsSync(pythonExe)) {
        proc = spawn(pythonExe, [exe, ...args], options);
      } else {
        proc = spawn('python', [exe, ...args], options);
      }
    } else {
      proc = spawn(exe, args, options);
    }

    // Detached GUI processes should not keep the extension host alive
    if (!captureOutput) {
      proc.unref();
    }

    return proc;
  }

  /**
   * Kill the running game process.
   */
  killGame(): void {
    if (this.gameProcess) {
      this.gameProcess.kill();
      this.gameProcess = null;
    }
  }

  dispose(): void {
    this.killGame();
  }
}
