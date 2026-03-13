/**
 * Ren'Py color provider.
 * Provides color swatches and picker for hex color values (#rrggbb, #rrggbbaa) in Character defines.
 */

import * as vscode from 'vscode';

/** Regex matching CSS-style hex colors: #rgb, #rrggbb, #rrggbbaa */
const COLOR_REGEX = /#([0-9a-fA-F]{3,8})\b/g;

export class RenpyColorProvider implements vscode.DocumentColorProvider {

  provideDocumentColors(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.ColorInformation[] {
    const colors: vscode.ColorInformation[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      COLOR_REGEX.lastIndex = 0;
      let match;

      while ((match = COLOR_REGEX.exec(line)) !== null) {
        const hex = match[1];
        const color = this.parseHexColor(hex);
        if (!color) continue;

        const range = new vscode.Range(i, match.index, i, match.index + match[0].length);
        colors.push(new vscode.ColorInformation(range, color));
      }
    }

    return colors;
  }

  provideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
    _token: vscode.CancellationToken,
  ): vscode.ColorPresentation[] {
    const r = Math.round(color.red * 255);
    const g = Math.round(color.green * 255);
    const b = Math.round(color.blue * 255);
    const a = Math.round(color.alpha * 255);

    const hex = color.alpha < 1
      ? `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}${this.toHex(a)}`
      : `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}`;

    const presentation = new vscode.ColorPresentation(hex);
    presentation.textEdit = new vscode.TextEdit(context.range, hex);

    return [presentation];
  }

  private parseHexColor(hex: string): vscode.Color | undefined {
    let r: number, g: number, b: number, a = 255;

    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    } else if (hex.length === 8) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
      a = parseInt(hex.substring(6, 8), 16);
    } else {
      return undefined;
    }

    if ([r, g, b, a].some(v => isNaN(v))) return undefined;

    return new vscode.Color(r / 255, g / 255, b / 255, a / 255);
  }

  private toHex(n: number): string {
    return n.toString(16).padStart(2, '0');
  }
}
