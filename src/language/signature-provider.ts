/**
 * Ren'Py signature help provider.
 * Shows parameter hints for Character(), label calls, screen definitions, etc.
 */

import * as vscode from 'vscode';
import { ProjectIndex } from '../parser/types';

interface SignatureDef {
  label: string;
  documentation: string;
  parameters: { label: string; documentation: string }[];
}

const BUILTIN_SIGNATURES: Map<string, SignatureDef> = new Map([
  ['Character', {
    label: 'Character(name, kind=None, **properties)',
    documentation: 'Defines a character for use in dialogue.',
    parameters: [
      { label: 'name', documentation: 'The display name of the character.' },
      { label: 'kind', documentation: 'The kind of character (adv or nvl). Default: adv.' },
      { label: 'color', documentation: 'The color of the character\'s name, as a hex string.' },
      { label: 'image', documentation: 'An image tag associated with this character.' },
      { label: 'who_prefix', documentation: 'String prepended to the character name.' },
      { label: 'who_suffix', documentation: 'String appended to the character name.' },
      { label: 'what_prefix', documentation: 'String prepended to dialogue text.' },
      { label: 'what_suffix', documentation: 'String appended to dialogue text.' },
    ],
  }],
  ['Dissolve', {
    label: 'Dissolve(time, alpha=False)',
    documentation: 'A dissolve transition.',
    parameters: [
      { label: 'time', documentation: 'The time the dissolve takes, in seconds.' },
      { label: 'alpha', documentation: 'If True, the dissolve is alpha-aware.' },
    ],
  }],
  ['Fade', {
    label: 'Fade(out_time, hold_time, in_time, color="#000")',
    documentation: 'Fades the screen to a color, holds, then fades in.',
    parameters: [
      { label: 'out_time', documentation: 'Time to fade to color.' },
      { label: 'hold_time', documentation: 'Time to hold the color.' },
      { label: 'in_time', documentation: 'Time to fade back in.' },
      { label: 'color', documentation: 'The color to fade through.' },
    ],
  }],
  ['MoveTransition', {
    label: 'MoveTransition(delay, enter=None, leave=None)',
    documentation: 'Transition that moves images to their new positions.',
    parameters: [
      { label: 'delay', documentation: 'The time the transition takes.' },
      { label: 'enter', documentation: 'Transition for newly shown images.' },
      { label: 'leave', documentation: 'Transition for newly hidden images.' },
    ],
  }],
  ['SetVariable', {
    label: 'SetVariable(name, value)',
    documentation: 'Sets a variable to a value.',
    parameters: [
      { label: 'name', documentation: 'The name of the variable to set (string).' },
      { label: 'value', documentation: 'The value to set it to.' },
    ],
  }],
  ['Show', {
    label: 'Show(screen, transition=None, **kwargs)',
    documentation: 'Shows a screen.',
    parameters: [
      { label: 'screen', documentation: 'The name of the screen to show.' },
      { label: 'transition', documentation: 'A transition to use.' },
    ],
  }],
  ['Hide', {
    label: 'Hide(screen, transition=None)',
    documentation: 'Hides a screen.',
    parameters: [
      { label: 'screen', documentation: 'The name of the screen to hide.' },
      { label: 'transition', documentation: 'A transition to use.' },
    ],
  }],
  ['Jump', {
    label: 'Jump(label)',
    documentation: 'Causes the current interaction to return, then jumps to label.',
    parameters: [
      { label: 'label', documentation: 'The label to jump to.' },
    ],
  }],
  ['Call', {
    label: 'Call(label, *args, **kwargs)',
    documentation: 'Causes the current interaction to return, then calls label.',
    parameters: [
      { label: 'label', documentation: 'The label to call.' },
    ],
  }],
  ['Play', {
    label: 'Play(channel, file, **kwargs)',
    documentation: 'Plays a sound on a channel.',
    parameters: [
      { label: 'channel', documentation: 'The audio channel (e.g., "music", "sound").' },
      { label: 'file', documentation: 'The audio file to play.' },
    ],
  }],
  ['FileSave', {
    label: 'FileSave(name, confirm=True, page=None)',
    documentation: 'Saves the game to a slot.',
    parameters: [
      { label: 'name', documentation: 'The save slot name.' },
      { label: 'confirm', documentation: 'If True, asks for confirmation before overwriting.' },
      { label: 'page', documentation: 'The save page.' },
    ],
  }],
  ['FileLoad', {
    label: 'FileLoad(name, confirm=True, page=None)',
    documentation: 'Loads the game from a slot.',
    parameters: [
      { label: 'name', documentation: 'The save slot name.' },
      { label: 'confirm', documentation: 'If True, asks for confirmation.' },
      { label: 'page', documentation: 'The save page.' },
    ],
  }],
]);

export class RenpySignatureProvider implements vscode.SignatureHelpProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.SignatureHelpContext,
  ): vscode.SignatureHelp | undefined {
    const lineText = document.lineAt(position.line).text;
    const textBefore = lineText.substring(0, position.character);

    // Find the function name before the opening paren
    const funcMatch = textBefore.match(/(\w+)\s*\([^)]*$/);
    if (!funcMatch) return undefined;

    const funcName = funcMatch[1];

    // Check built-in signatures
    const sigDef = BUILTIN_SIGNATURES.get(funcName);
    if (!sigDef) {
      // Check for label calls with parameters
      return this.labelSignature(funcName);
    }

    const sig = new vscode.SignatureInformation(sigDef.label, sigDef.documentation);
    for (const param of sigDef.parameters) {
      sig.parameters.push(new vscode.ParameterInformation(param.label, param.documentation));
    }

    const help = new vscode.SignatureHelp();
    help.signatures = [sig];
    help.activeSignature = 0;

    // Determine active parameter by counting commas
    const argsText = textBefore.substring(textBefore.lastIndexOf('(') + 1);
    help.activeParameter = (argsText.match(/,/g) || []).length;

    return help;
  }

  private labelSignature(name: string): vscode.SignatureHelp | undefined {
    const index = this.getIndex();
    const entries = index.labels.get(name);
    if (!entries || entries.length === 0) return undefined;

    const entry = entries[0];
    if (!entry.node.parameters) return undefined;

    const sig = new vscode.SignatureInformation(
      `label ${name}(${entry.node.parameters})`,
      `Label defined at ${entry.file}:${entry.node.line + 1}`,
    );

    // Parse parameters
    const params = entry.node.parameters.split(',').map(p => p.trim());
    for (const p of params) {
      const paramName = p.split('=')[0].trim();
      sig.parameters.push(new vscode.ParameterInformation(paramName));
    }

    const help = new vscode.SignatureHelp();
    help.signatures = [sig];
    help.activeSignature = 0;
    help.activeParameter = 0;
    return help;
  }
}
