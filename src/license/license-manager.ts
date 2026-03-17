/**
 * License key validation for RenPy Code Pro features.
 * License keys are sold via Gumroad and verified through the Gumroad API.
 *
 * Free features: syntax highlighting, completion, hover, diagnostics, definition, symbols, etc.
 * Pro features: debugger, flow graph, live preview, variable tracker, heatmap, asset manager,
 *               translation dashboard, refactoring, consistency check, auto-test
 */

import * as vscode from 'vscode';
import https from 'https';

export type Feature =
  | 'debugger'
  | 'flow-graph'
  | 'auto-test'
  | 'live-preview'
  | 'atl-preview'
  | 'save-inspector'
  | 'refactoring'
  | 'profiler';

const GUMROAD_PRODUCT_ID = 'uBzcDZR8buavqlk0kPmraw==';
const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';

/** Cache key in VS Code globalState */
const CACHE_KEY = 'renpyCode.licenseCache';

interface LicenseCache {
  key: string;
  valid: boolean;
  verifiedAt: number; // epoch ms
}

/** Re-verify online every 7 days */
const REVALIDATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export class LicenseManager {
  private _isValid: boolean = false;
  private _onDidChange = new vscode.EventEmitter<boolean>();
  private _context?: vscode.ExtensionContext;

  readonly onDidChange = this._onDidChange.event;

  get isProLicensed(): boolean {
    return this._isValid;
  }

  /**
   * Initialize license from stored settings.
   * Uses cached result if recent enough, otherwise re-verifies online.
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this._context = context;

    const key = vscode.workspace.getConfiguration('renpyCode').get<string>('license.key', '');
    if (!key) return;

    // Check cache first
    const cache = context.globalState.get<LicenseCache>(CACHE_KEY);
    if (cache && cache.key === key && cache.valid) {
      const age = Date.now() - cache.verifiedAt;
      if (age < REVALIDATION_INTERVAL_MS) {
        this.setValid(true);
        return;
      }
    }

    // Verify online
    const valid = await this.verifyWithGumroad(key);
    this.setValid(valid);
    await this.updateCache(key, valid);
  }

  /**
   * Check if a specific Pro feature is available.
   */
  hasFeature(_feature: Feature): boolean {
    return this._isValid;
  }

  /**
   * Prompt user for license key and validate via Gumroad API.
   */
  async activateLicense(): Promise<void> {
    const key = await vscode.window.showInputBox({
      title: vscode.l10n.t('RenPy Code Pro License Key'),
      prompt: vscode.l10n.t('Enter your Gumroad license key'),
      placeHolder: 'XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
      validateInput: (value) => {
        if (!value?.trim()) return vscode.l10n.t('Please enter a license key');
        return null;
      },
    });

    if (!key) return;

    const trimmed = key.trim();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Verifying license key...'),
        cancellable: false,
      },
      async () => {
        const valid = await this.verifyWithGumroad(trimmed);
        if (valid) {
          this.setValid(true);
          const config = vscode.workspace.getConfiguration('renpyCode');
          await config.update('license.key', trimmed, vscode.ConfigurationTarget.Global);
          await this.updateCache(trimmed, true);
          vscode.window.showInformationMessage(
            vscode.l10n.t('RenPy Code Pro activated! All Pro features are now available.'),
          );
        } else {
          vscode.window.showErrorMessage(
            vscode.l10n.t('Invalid license key. Please check your key and try again.'),
          );
        }
      },
    );
  }

  /**
   * Require Pro license for a feature. Shows activation prompt if not licensed.
   */
  async requirePro(feature: Feature): Promise<boolean> {
    if (this._isValid) return true;

    const featureNames: Record<Feature, string> = {
      'debugger': vscode.l10n.t('Debugger'),
      'flow-graph': vscode.l10n.t('Story Flow Graph'),
      'auto-test': vscode.l10n.t('Auto-Test'),
      'live-preview': vscode.l10n.t('Live Preview'),
      'atl-preview': vscode.l10n.t('ATL Animation Preview'),
      'save-inspector': vscode.l10n.t('Save Inspector'),
      'refactoring': vscode.l10n.t('Refactoring Tools'),
      'profiler': vscode.l10n.t('Performance Profiler'),
    };

    const enterKey = vscode.l10n.t('Enter License Key');
    const purchase = vscode.l10n.t('Purchase on Gumroad');

    const result = await vscode.window.showWarningMessage(
      vscode.l10n.t(
        '{0} is a RenPy Code Pro feature. Purchase a license on Gumroad to unlock it.',
        featureNames[feature],
      ),
      enterKey,
      purchase,
    );

    if (result === enterKey) {
      await this.activateLicense();
      return this._isValid;
    }

    if (result === purchase) {
      vscode.env.openExternal(vscode.Uri.parse('https://y1uda.gumroad.com/l/renpycode'));
    }

    return false;
  }

  /**
   * Verify a license key against Gumroad's API.
   */
  private verifyWithGumroad(licenseKey: string): Promise<boolean> {
    return new Promise((resolve) => {
      const postData = `product_id=${encodeURIComponent(GUMROAD_PRODUCT_ID)}&license_key=${encodeURIComponent(licenseKey)}`;

      const req = https.request(
        GUMROAD_VERIFY_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 10000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (json.success !== true) {
                console.warn('[RenPy Code] License verification failed:', json.message || JSON.stringify(json));
              }
              resolve(json.success === true);
            } catch (e) {
              console.error('[RenPy Code] License verification parse error:', e, body);
              resolve(false);
            }
          });
        },
      );

      req.on('error', (err) => { console.error('[RenPy Code] License verification network error:', err.message); resolve(false); });
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(postData);
      req.end();
    });
  }

  private setValid(valid: boolean): void {
    this._isValid = valid;
    this._onDidChange.fire(valid);
  }

  private async updateCache(key: string, valid: boolean): Promise<void> {
    if (this._context) {
      await this._context.globalState.update(CACHE_KEY, {
        key,
        valid,
        verifiedAt: Date.now(),
      } satisfies LicenseCache);
    }
  }

  /**
   * Called when the license key setting is changed.
   * Re-verifies the new key against Gumroad.
   */
  async onLicenseKeyChanged(): Promise<void> {
    const key = vscode.workspace.getConfiguration('renpyCode').get<string>('license.key', '');
    if (!key) {
      this.setValid(false);
      if (this._context) {
        await this._context.globalState.update(CACHE_KEY, undefined);
      }
      return;
    }

    const valid = await this.verifyWithGumroad(key);
    this.setValid(valid);
    await this.updateCache(key, valid);

    if (valid) {
      vscode.window.showInformationMessage(
        vscode.l10n.t('RenPy Code Pro activated! All Pro features are now available.'),
      );
    } else {
      vscode.window.showErrorMessage(
        vscode.l10n.t('Invalid license key. Please check your key and try again.'),
      );
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
