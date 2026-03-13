/**
 * Bridge manager for live game communication.
 * File-based IPC via game/_mcp/ directory (cmd.json / status.json).
 * Based on MCP bridge architecture.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface BridgeState {
  connected: boolean;
  label?: string;
  variables?: Record<string, unknown>;
  timestamp?: number;
}

export interface BridgeCommand {
  action: string;
  [key: string]: unknown;
}

export interface BridgeResponse {
  action: string;
  status: string;
  [key: string]: unknown;
}

export class BridgeManager {
  private _mcpDir: string = '';
  private _onStateChanged = new vscode.EventEmitter<BridgeState>();
  private _pollInterval: NodeJS.Timeout | null = null;
  private _lastState: BridgeState = { connected: false };

  readonly onStateChanged = this._onStateChanged.event;

  get state(): BridgeState {
    return this._lastState;
  }

  /**
   * Set the project root and start monitoring.
   */
  setProjectRoot(projectRoot: string): void {
    this._mcpDir = path.join(projectRoot, 'game', '_mcp');
    this.ensureDir();
  }

  /**
   * Start polling for bridge status.
   */
  startPolling(intervalMs: number = 1000): void {
    this.stopPolling();
    this._pollInterval = setInterval(() => {
      this.checkStatus();
    }, intervalMs);
  }

  /**
   * Stop polling.
   */
  stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  /**
   * Check if bridge is connected (status.json age < 5s).
   */
  isConnected(): boolean {
    try {
      const statusPath = path.join(this._mcpDir, 'status.json');
      if (!fs.existsSync(statusPath)) return false;

      const stat = fs.statSync(statusPath);
      const age = Date.now() - stat.mtimeMs;
      return age < 5000;
    } catch {
      return false;
    }
  }

  /**
   * Read current bridge status.
   */
  readStatus(): BridgeResponse | null {
    try {
      const statusPath = path.join(this._mcpDir, 'status.json');
      if (!fs.existsSync(statusPath)) return null;
      const content = fs.readFileSync(statusPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Send a command to the bridge.
   * Writes to cmd.json atomically, then waits for response in status.json.
   */
  async sendCommand(command: BridgeCommand, timeoutMs: number = 5000): Promise<BridgeResponse | null> {
    this.ensureDir();

    const cmdPath = path.join(this._mcpDir, 'cmd.json');
    const statusPath = path.join(this._mcpDir, 'status.json');
    const tmpPath = cmdPath + '.tmp';

    // Atomic write
    const content = JSON.stringify({ ...command, _ts: Date.now() });
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, cmdPath);

    // Wait for response
    const startTime = Date.now();
    const expectedAction = command.action;

    while (Date.now() - startTime < timeoutMs) {
      await this.sleep(100);

      try {
        if (!fs.existsSync(statusPath)) continue;

        const stat = fs.statSync(statusPath);
        if (stat.mtimeMs < startTime) continue; // Old response

        const response = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
        if (response.action === expectedAction) {
          return response;
        }
      } catch {
        // File might be partially written
      }
    }

    return null;
  }

  /**
   * Convenience: ping the bridge.
   */
  async ping(): Promise<boolean> {
    const response = await this.sendCommand({ action: 'ping' }, 3000);
    return response?.status === 'ok';
  }

  /**
   * Convenience: get current game state.
   */
  async getState(): Promise<BridgeResponse | null> {
    return this.sendCommand({ action: 'get_state' });
  }

  /**
   * Convenience: take a screenshot.
   */
  async screenshot(): Promise<string | null> {
    const response = await this.sendCommand({ action: 'screenshot' }, 10000);
    if (response?.status === 'ok') {
      const screenshotPath = path.join(this._mcpDir, 'screenshot.png');
      if (fs.existsSync(screenshotPath)) {
        return screenshotPath;
      }
    }
    return null;
  }

  /**
   * Convenience: evaluate expression in game.
   */
  async evaluate(expression: string): Promise<BridgeResponse | null> {
    return this.sendCommand({ action: 'eval', expression });
  }

  /**
   * Convenience: jump to label.
   */
  async jumpToLabel(label: string): Promise<BridgeResponse | null> {
    return this.sendCommand({ action: 'jump', label });
  }

  /**
   * Convenience: set a variable.
   */
  async setVariable(name: string, value: string): Promise<BridgeResponse | null> {
    return this.sendCommand({ action: 'set_variable', name, value });
  }

  /**
   * Convenience: send notification.
   */
  async notify(message: string): Promise<BridgeResponse | null> {
    return this.sendCommand({ action: 'notify', message });
  }

  /**
   * Convenience: get screen hierarchy.
   */
  async getScreenHierarchy(screenName?: string): Promise<BridgeResponse | null> {
    return this.sendCommand({ action: 'screen_hierarchy', screen_name: screenName });
  }

  /**
   * Convenience: start tracking.
   */
  async startTracking(): Promise<BridgeResponse | null> {
    return this.sendCommand({ action: 'start_tracking' });
  }

  /**
   * Convenience: stop tracking.
   */
  async stopTracking(): Promise<BridgeResponse | null> {
    return this.sendCommand({ action: 'stop_tracking' });
  }

  /**
   * Convenience: get tracking data.
   */
  async getTracking(): Promise<BridgeResponse | null> {
    return this.sendCommand({ action: 'get_tracking' });
  }

  /**
   * Install bridge script into the game.
   */
  installBridge(extensionPath: string, projectRoot: string): boolean {
    try {
      const bridgeSrc = path.join(extensionPath, 'bridge', 'bridge-script.rpy');
      const bridgeDst = path.join(projectRoot, 'game', '_mcp_bridge.rpy');

      if (!fs.existsSync(bridgeSrc)) return false;

      fs.copyFileSync(bridgeSrc, bridgeDst);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Uninstall bridge script.
   */
  uninstallBridge(projectRoot: string): void {
    const files = ['_mcp_bridge.rpy', '_mcp_bridge.rpyc'];
    for (const f of files) {
      const p = path.join(projectRoot, 'game', f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // Clean up _mcp directory
    const mcpDir = path.join(projectRoot, 'game', '_mcp');
    if (fs.existsSync(mcpDir)) {
      const files = fs.readdirSync(mcpDir);
      for (const f of files) {
        fs.unlinkSync(path.join(mcpDir, f));
      }
      fs.rmdirSync(mcpDir);
    }
  }

  private checkStatus(): void {
    const connected = this.isConnected();
    const statusData = connected ? this.readStatus() : null;

    const newState: BridgeState = {
      connected,
      label: statusData?.label as string | undefined,
      variables: statusData?.variables as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    };

    const changed = newState.connected !== this._lastState.connected ||
                    newState.label !== this._lastState.label;

    this._lastState = newState;
    if (changed) {
      this._onStateChanged.fire(newState);
    }
  }

  private ensureDir(): void {
    if (this._mcpDir && !fs.existsSync(this._mcpDir)) {
      fs.mkdirSync(this._mcpDir, { recursive: true });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  dispose(): void {
    this.stopPolling();
    this._onStateChanged.dispose();
  }
}
