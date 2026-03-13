/**
 * Ren'Py parser.
 * Parses scanned lines into an AST (tree of RenpyNode).
 * Line-based parser with indentation-driven block structure.
 */

import { scanLines, ScannedLine, hasMixedIndentation } from './scanner';
import {
  RenpyNode, ParsedFile, ParseError, Range, Position,
  LabelNode, DialogueNode, NarrationNode, CommandNode,
  DefineNode, DefaultNode, ScreenNode, InitBlockNode,
  PythonBlockNode, PythonLineNode, IfBlockNode, MenuNode,
  MenuChoiceNode, ImageDefNode, TransformDefNode, StyleDefNode,
  TestcaseNode, TranslateNode, CommentNode, BlankNode,
  ForBlockNode, WhileBlockNode, UnknownNode,
  CHARACTER_DEF_RE,
} from './types';

// ── Regex patterns ────────────────────────────────────────────

const RE_LABEL = /^label\s+(\w+)(?:\s*\((.+)\))?\s*:/;
const RE_SCREEN = /^screen\s+(\w+)(?:\s*\((.*)\))?\s*:/;
const RE_DEFINE = /^define\s+([\w.]+)\s*=\s*(.+)$/;
const RE_DEFAULT = /^default\s+([\w.]+)\s*=\s*(.+)$/;
const RE_IMAGE_EQ = /^image\s+([\w\s]+?)\s*=\s*(.+)$/;
const RE_IMAGE_BLOCK = /^image\s+([\w\s]+?)\s*:/;
const RE_TRANSFORM = /^transform\s+(\w+)(?:\s*\((.+)\))?\s*:/;
const RE_STYLE = /^style\s+(\w+)(?:\s+is\s+(\w+))?\s*:/;
const RE_TESTCASE = /^testcase\s+(\w+)\s*:/;
const RE_TRANSLATE = /^translate\s+(\w+)\s+(\w+|strings)\s*:/;
const RE_INIT = /^init(?:\s+(-?\d+))?\s*(?:(python)(?:\s+(early|in\s+\w+))?)?\s*:/;
const RE_PYTHON_BLOCK = /^python(?:\s+(early|in\s+\w+))?\s*:/;
const RE_PYTHON_LINE = /^\$\s+(.+)$/;
const RE_IF = /^(if|elif)\s+(.+)\s*:/;
const RE_ELSE = /^else\s*:/;
const RE_FOR = /^for\s+(\w+)\s+in\s+(.+)\s*:/;
const RE_WHILE = /^while\s+(.+)\s*:/;
const RE_MENU = /^menu(?:\s+(\w+))?\s*:/;
const RE_MENU_CHOICE = /^"((?:[^"\\]|\\.)*)"\s*(?:if\s+(.+))?\s*:/;
const RE_JUMP = /^jump\s+([\w.]+(?:\s+expression)?)/;
const RE_CALL = /^call\s+([\w.]+(?:\s+expression)?)(?:\s+from\s+\w+)?(?:\s*\((.+)\))?/;
const RE_RETURN = /^return(?:\s+(.+))?$/;
const RE_SCENE = /^scene\s+([\w\s]+?)(?:\s+(?:at|behind|onlayer|as|zorder)\s+.+)?$/;
const RE_SHOW = /^show\s+([\w\s]+?)(?:\s+(?:at|behind|onlayer|as|zorder)\s+.+)?$/;
const RE_HIDE = /^hide\s+([\w\s]+?)(?:\s+(?:at|behind|onlayer|as)\s+.+)?$/;
const RE_WITH = /^with\s+(\w+(?:\s*\(.+\))?)/;
const RE_PLAY = /^(play|stop|queue)\s+(music|sound|audio|voice|channel\s+\w+)(?:\s+(.+))?/;
const RE_VOICE = /^voice\s+(.+)/;
const RE_WINDOW = /^window\s+(show|hide|auto)/;
const RE_PASS = /^pass\s*$/;
const RE_DIALOGUE = /^(\w+)\s+"((?:[^"\\]|\\.)*)"\s*$/;
const RE_NARRATION = /^"((?:[^"\\]|\\.)*)"\s*$/;

export class Parser {
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  /**
   * Parse a complete .rpy file into a structured AST.
   */
  parse(text: string): ParsedFile {
    const lines = scanLines(text);
    const errors: ParseError[] = [];
    const nodes = this.parseBlock(lines, 0, 0, errors);

    // Build lookup maps
    const labels = new Map<string, LabelNode>();
    const screens = new Map<string, ScreenNode>();
    const characters = new Map<string, DefineNode>();
    const images = new Map<string, ImageDefNode>();
    const transforms = new Map<string, TransformDefNode>();
    const defines = new Map<string, DefineNode>();
    const defaults = new Map<string, DefaultNode>();
    const testcases = new Map<string, TestcaseNode>();

    this.collectDefinitions(nodes, labels, screens, characters, images, transforms, defines, defaults, testcases);

    return {
      file: this.file,
      nodes,
      labels,
      screens,
      characters,
      images,
      transforms,
      defines,
      defaults,
      testcases,
      errors,
    };
  }

  /**
   * Parse a block of lines at a given indentation level.
   * Returns all top-level nodes for lines at or deeper than `minIndent` starting from `startIdx`.
   */
  private parseBlock(
    lines: ScannedLine[],
    startIdx: number,
    minIndent: number,
    errors: ParseError[],
  ): RenpyNode[] {
    const nodes: RenpyNode[] = [];
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];

      // Skip blank lines
      if (line.content === '') {
        nodes.push(this.makeBlank(line));
        i++;
        continue;
      }

      // If this line is less indented than our block, stop
      if (!line.isEmpty && line.indent < minIndent) {
        break;
      }

      // Skip comments (but include them in nodes)
      if (line.isComment) {
        nodes.push(this.makeComment(line));
        i++;
        continue;
      }

      // Check for mixed indentation
      if (hasMixedIndentation(line.raw)) {
        errors.push({
          message: 'Mixed indentation (tabs and spaces)',
          range: this.lineRange(line),
          severity: 'warning',
        });
      }

      // Parse the line
      const { node, nextIndex } = this.parseLine(lines, i, errors);
      nodes.push(node);
      i = nextIndex;
    }

    return nodes;
  }

  /**
   * Parse a single line, potentially consuming child lines for blocks.
   */
  private parseLine(
    lines: ScannedLine[],
    idx: number,
    errors: ParseError[],
  ): { node: RenpyNode; nextIndex: number } {
    const line = lines[idx];
    const content = line.content;
    let m: RegExpMatchArray | null;

    // ── Block-starting statements ──

    if ((m = content.match(RE_LABEL))) {
      const node = this.makeLabelNode(line, m);
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_SCREEN))) {
      const node = this.makeScreenNode(line, m);
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_INIT))) {
      const node: InitBlockNode = {
        type: 'init_block',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        priority: m[1] ? parseInt(m[1], 10) : undefined,
        isPython: !!m[2],
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_PYTHON_BLOCK))) {
      const node: PythonBlockNode = {
        type: 'python_block',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        modifier: m[1],
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_IF)) || (m = content.match(RE_ELSE))) {
      const keyword = content.startsWith('else') ? 'else' as const : (m[1] as 'if' | 'elif');
      const condition = keyword === 'else' ? '' : m[2];
      const node: IfBlockNode = {
        type: 'if_block',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        condition,
        conditionRange: keyword === 'else' ? this.lineRange(line) : this.substringRange(line, content.indexOf(m[2]), m[2].length),
        keyword,
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_FOR))) {
      const node: ForBlockNode = {
        type: 'for_block',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        variable: m[1],
        iterable: m[2],
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_WHILE))) {
      const node: WhileBlockNode = {
        type: 'while_block',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        condition: m[1],
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_MENU))) {
      const node: MenuNode = {
        type: 'menu',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        label: m[1],
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_MENU_CHOICE))) {
      const node: MenuChoiceNode = {
        type: 'menu_choice',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        text: m[1],
        textRange: this.substringRange(line, content.indexOf('"') + 1, m[1].length),
        condition: m[2],
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_IMAGE_BLOCK))) {
      const node: ImageDefNode = {
        type: 'image_def',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        name: m[1].trim(),
        nameRange: this.substringRange(line, content.indexOf(m[1]), m[1].length),
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_TRANSFORM))) {
      const node: TransformDefNode = {
        type: 'transform_def',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        name: m[1],
        nameRange: this.substringRange(line, content.indexOf(m[1]), m[1].length),
        parameters: m[2],
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_STYLE))) {
      const node: StyleDefNode = {
        type: 'style_def',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        name: m[1],
        nameRange: this.substringRange(line, content.indexOf(m[1]), m[1].length),
        parent: m[2],
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_TESTCASE))) {
      const node: TestcaseNode = {
        type: 'testcase',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        name: m[1],
        nameRange: this.substringRange(line, content.indexOf(m[1]), m[1].length),
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    if ((m = content.match(RE_TRANSLATE))) {
      const node: TranslateNode = {
        type: 'translate',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        language: m[1],
        identifier: m[2],
      };
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    // ── Single-line statements ──

    if ((m = content.match(RE_IMAGE_EQ))) {
      const node: ImageDefNode = {
        type: 'image_def',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        name: m[1].trim(),
        nameRange: this.substringRange(line, content.indexOf(m[1]), m[1].length),
        value: m[2],
      };
      return { node, nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_DEFINE))) {
      const node: DefineNode = {
        type: 'define',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        name: m[1],
        nameRange: this.substringRange(line, content.indexOf(m[1]), m[1].length),
        value: m[2],
        valueRange: this.substringRange(line, content.lastIndexOf(m[2]), m[2].length),
      };
      return { node, nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_DEFAULT))) {
      const node: DefaultNode = {
        type: 'default',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        name: m[1],
        nameRange: this.substringRange(line, content.indexOf(m[1]), m[1].length),
        value: m[2],
        valueRange: this.substringRange(line, content.lastIndexOf(m[2]), m[2].length),
      };
      return { node, nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_PYTHON_LINE))) {
      const expr = m[1];
      const node: PythonLineNode = {
        type: 'python_line',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        expression: expr,
        expressionRange: this.substringRange(line, content.indexOf(expr), expr.length),
      };
      return { node, nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_JUMP))) {
      return { node: this.makeCommand(line, 'jump', m[1], content.indexOf(m[1]), m[1].length), nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_CALL))) {
      return { node: this.makeCommand(line, 'call', m[1], content.indexOf(m[1]), m[1].length), nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_RETURN))) {
      return { node: this.makeCommand(line, 'return'), nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_SCENE))) {
      return { node: this.makeCommand(line, 'scene', m[1].trim(), content.indexOf(m[1]), m[1].trim().length), nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_SHOW))) {
      return { node: this.makeCommand(line, 'show', m[1].trim(), content.indexOf(m[1]), m[1].trim().length), nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_HIDE))) {
      return { node: this.makeCommand(line, 'hide', m[1].trim(), content.indexOf(m[1]), m[1].trim().length), nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_WITH))) {
      return { node: this.makeCommand(line, 'with', m[1], content.indexOf(m[1]), m[1].length), nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_PLAY))) {
      const args = `${m[2]}${m[3] ? ' ' + m[3] : ''}`;
      return { node: this.makeCommand(line, m[1], args), nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_VOICE))) {
      return { node: this.makeCommand(line, 'voice', m[1]), nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_WINDOW))) {
      return { node: this.makeCommand(line, 'window', m[1]), nextIndex: idx + 1 };
    }

    if (content.match(RE_PASS)) {
      return { node: this.makeCommand(line, 'pass'), nextIndex: idx + 1 };
    }

    // ── Dialogue / Narration ──

    if ((m = content.match(RE_DIALOGUE))) {
      const charName = m[1];
      const text = m[2];
      const charStart = content.indexOf(charName);
      const textStart = content.indexOf('"', charStart + charName.length) + 1;
      const node: DialogueNode = {
        type: 'dialogue',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        character: charName,
        characterRange: this.substringRange(line, charStart, charName.length),
        text,
        textRange: this.substringRange(line, textStart, text.length),
      };
      return { node, nextIndex: idx + 1 };
    }

    if ((m = content.match(RE_NARRATION))) {
      const text = m[1];
      const textStart = content.indexOf('"') + 1;
      const node: NarrationNode = {
        type: 'narration',
        range: this.lineRange(line),
        line: line.lineNumber,
        indent: line.indent,
        raw: line.raw,
        children: [],
        text,
        textRange: this.substringRange(line, textStart, text.length),
      };
      return { node, nextIndex: idx + 1 };
    }

    // ── Unknown ──
    const node: UnknownNode = {
      type: 'unknown',
      range: this.lineRange(line),
      line: line.lineNumber,
      indent: line.indent,
      raw: line.raw,
      children: [],
    };

    // If the line ends with ':', it might have children
    if (content.endsWith(':')) {
      const children = this.collectChildren(lines, idx, errors);
      node.children = children.nodes;
      return { node, nextIndex: children.nextIndex };
    }

    return { node, nextIndex: idx + 1 };
  }

  /**
   * Collect child nodes that are more indented than the current line.
   */
  private collectChildren(
    lines: ScannedLine[],
    parentIdx: number,
    errors: ParseError[],
  ): { nodes: RenpyNode[]; nextIndex: number } {
    const parentIndent = lines[parentIdx].indent;
    let childIdx = parentIdx + 1;

    // Skip blank lines to find the child indentation
    while (childIdx < lines.length && lines[childIdx].isEmpty) {
      childIdx++;
    }

    if (childIdx >= lines.length || lines[childIdx].indent <= parentIndent) {
      return { nodes: [], nextIndex: parentIdx + 1 };
    }

    const childIndent = lines[childIdx].indent;
    const nodes = this.parseBlock(lines, parentIdx + 1, childIndent, errors);

    // Find the actual next index (after all children)
    let nextIdx = parentIdx + 1;
    for (let i = parentIdx + 1; i < lines.length; i++) {
      if (!lines[i].isEmpty && lines[i].indent < childIndent) {
        nextIdx = i;
        return { nodes, nextIndex: nextIdx };
      }
      nextIdx = i + 1;
    }

    return { nodes, nextIndex: nextIdx };
  }

  // ── Node factory helpers ──

  private makeLabelNode(line: ScannedLine, m: RegExpMatchArray): LabelNode {
    const name = m[1];
    const nameStart = line.content.indexOf(name, 6); // after 'label '
    return {
      type: 'label',
      range: this.lineRange(line),
      line: line.lineNumber,
      indent: line.indent,
      raw: line.raw,
      children: [],
      name,
      nameRange: this.substringRange(line, nameStart, name.length),
      parameters: m[2],
    };
  }

  private makeScreenNode(line: ScannedLine, m: RegExpMatchArray): ScreenNode {
    const name = m[1];
    const nameStart = line.content.indexOf(name, 7); // after 'screen '
    return {
      type: 'screen',
      range: this.lineRange(line),
      line: line.lineNumber,
      indent: line.indent,
      raw: line.raw,
      children: [],
      name,
      nameRange: this.substringRange(line, nameStart, name.length),
      parameters: m[2],
    };
  }

  private makeCommand(
    line: ScannedLine,
    command: string,
    target?: string,
    targetOffset?: number,
    targetLength?: number,
  ): CommandNode {
    const cmdStart = line.content.indexOf(command);
    const node: CommandNode = {
      type: 'command',
      range: this.lineRange(line),
      line: line.lineNumber,
      indent: line.indent,
      raw: line.raw,
      children: [],
      command,
      commandRange: this.substringRange(line, cmdStart, command.length),
    };
    if (target !== undefined && targetOffset !== undefined && targetLength !== undefined) {
      node.target = target;
      node.targetRange = this.substringRange(line, targetOffset, targetLength);
    }
    return node;
  }

  private makeComment(line: ScannedLine): CommentNode {
    return {
      type: 'comment',
      range: this.lineRange(line),
      line: line.lineNumber,
      indent: line.indent,
      raw: line.raw,
      children: [],
      text: line.content.substring(1).trim(),
    };
  }

  private makeBlank(line: ScannedLine): BlankNode {
    return {
      type: 'blank',
      range: this.lineRange(line),
      line: line.lineNumber,
      indent: line.indent,
      raw: line.raw,
      children: [],
    };
  }

  // ── Range helpers ──

  private lineRange(line: ScannedLine): Range {
    return {
      start: { line: line.lineNumber, column: 0 },
      end: { line: line.lineNumber, column: line.raw.length },
    };
  }

  private substringRange(line: ScannedLine, contentOffset: number, length: number): Range {
    const col = line.indent + contentOffset;
    return {
      start: { line: line.lineNumber, column: col },
      end: { line: line.lineNumber, column: col + length },
    };
  }

  // ── Definition collection ──

  private collectDefinitions(
    nodes: RenpyNode[],
    labels: Map<string, LabelNode>,
    screens: Map<string, ScreenNode>,
    characters: Map<string, DefineNode>,
    images: Map<string, ImageDefNode>,
    transforms: Map<string, TransformDefNode>,
    defines: Map<string, DefineNode>,
    defaults: Map<string, DefaultNode>,
    testcases: Map<string, TestcaseNode>,
  ): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'label':
          labels.set(node.name, node);
          break;
        case 'screen':
          screens.set(node.name, node);
          break;
        case 'define':
          defines.set(node.name, node);
          if (CHARACTER_DEF_RE.test(node.value)) {
            characters.set(node.name, node);
          }
          break;
        case 'default':
          defaults.set(node.name, node);
          break;
        case 'image_def':
          images.set(node.name, node);
          break;
        case 'transform_def':
          transforms.set(node.name, node);
          break;
        case 'testcase':
          testcases.set(node.name, node);
          break;
        case 'init_block':
          // Recurse into init blocks
          this.collectDefinitions(node.children, labels, screens, characters, images, transforms, defines, defaults, testcases);
          break;
      }

      // Also recurse into children for nested definitions
      if (node.children.length > 0 && node.type !== 'init_block') {
        this.collectDefinitions(node.children, labels, screens, characters, images, transforms, defines, defaults, testcases);
      }
    }
  }
}
