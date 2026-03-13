/**
 * Ren'Py AST types
 */

export interface Position {
  line: number;   // 0-based
  column: number; // 0-based
}

export interface Range {
  start: Position;
  end: Position;
}

export type NodeType =
  | 'label'
  | 'dialogue'
  | 'narration'
  | 'command'      // jump, call, return, scene, show, hide, with, play, stop, queue, window, voice
  | 'define'       // define x = ...
  | 'default'      // default x = ...
  | 'screen'       // screen name(...):
  | 'init_block'   // init [priority] [python]:
  | 'python_block' // python:
  | 'python_line'  // $ ...
  | 'if_block'     // if/elif/else
  | 'menu'         // menu:
  | 'menu_choice'  // "choice text":
  | 'image_def'    // image name = ... or image name:
  | 'transform_def'// transform name:
  | 'style_def'    // style name:
  | 'testcase'     // testcase name:
  | 'translate'    // translate lang hash:
  | 'comment'
  | 'blank'
  | 'for_block'    // for x in ...:
  | 'while_block'  // while ...:
  | 'unknown';

export interface BaseNode {
  type: NodeType;
  range: Range;
  line: number;       // 0-based line number
  indent: number;     // indentation level (number of spaces)
  raw: string;        // original line text
  children: RenpyNode[];
}

/** label name(...): */
export interface LabelNode extends BaseNode {
  type: 'label';
  name: string;
  nameRange: Range;
  parameters?: string;
}

/** character "dialogue text" */
export interface DialogueNode extends BaseNode {
  type: 'dialogue';
  character: string;
  characterRange: Range;
  text: string;
  textRange: Range;
}

/** "narration text" */
export interface NarrationNode extends BaseNode {
  type: 'narration';
  text: string;
  textRange: Range;
}

/** jump/call/return/scene/show/hide/with/play/stop/queue */
export interface CommandNode extends BaseNode {
  type: 'command';
  command: string;         // 'jump' | 'call' | 'return' | 'scene' | 'show' | 'hide' | 'with' | 'play' | 'stop' | 'queue' | 'voice' | 'window' | 'pass'
  commandRange: Range;
  target?: string;         // for jump/call: label name; for scene/show/hide: image name
  targetRange?: Range;
  args?: string;           // remaining args
}

/** define x = value */
export interface DefineNode extends BaseNode {
  type: 'define';
  name: string;
  nameRange: Range;
  value: string;
  valueRange: Range;
}

/** default x = value */
export interface DefaultNode extends BaseNode {
  type: 'default';
  name: string;
  nameRange: Range;
  value: string;
  valueRange: Range;
}

/** screen name(...): */
export interface ScreenNode extends BaseNode {
  type: 'screen';
  name: string;
  nameRange: Range;
  parameters?: string;
}

/** init [priority] [python]: */
export interface InitBlockNode extends BaseNode {
  type: 'init_block';
  priority?: number;
  isPython: boolean;
}

/** python: */
export interface PythonBlockNode extends BaseNode {
  type: 'python_block';
  modifier?: string; // 'early', 'in namespace'
}

/** $ expression */
export interface PythonLineNode extends BaseNode {
  type: 'python_line';
  expression: string;
  expressionRange: Range;
}

/** if/elif/else */
export interface IfBlockNode extends BaseNode {
  type: 'if_block';
  condition: string;
  conditionRange: Range;
  keyword: 'if' | 'elif' | 'else';
}

/** menu: */
export interface MenuNode extends BaseNode {
  type: 'menu';
  label?: string; // optional menu label
}

/** "choice text" [if condition]: */
export interface MenuChoiceNode extends BaseNode {
  type: 'menu_choice';
  text: string;
  textRange: Range;
  condition?: string;
}

/** image name = "file" or image name: (ATL) */
export interface ImageDefNode extends BaseNode {
  type: 'image_def';
  name: string;
  nameRange: Range;
  value?: string;
}

/** transform name(...): */
export interface TransformDefNode extends BaseNode {
  type: 'transform_def';
  name: string;
  nameRange: Range;
  parameters?: string;
}

/** style name [is parent]: */
export interface StyleDefNode extends BaseNode {
  type: 'style_def';
  name: string;
  nameRange: Range;
  parent?: string;
}

/** testcase name: */
export interface TestcaseNode extends BaseNode {
  type: 'testcase';
  name: string;
  nameRange: Range;
}

/** translate lang hash: */
export interface TranslateNode extends BaseNode {
  type: 'translate';
  language: string;
  identifier: string;
}

export interface CommentNode extends BaseNode {
  type: 'comment';
  text: string;
}

export interface BlankNode extends BaseNode {
  type: 'blank';
}

export interface ForBlockNode extends BaseNode {
  type: 'for_block';
  variable: string;
  iterable: string;
}

export interface WhileBlockNode extends BaseNode {
  type: 'while_block';
  condition: string;
}

export interface UnknownNode extends BaseNode {
  type: 'unknown';
}

export type RenpyNode =
  | LabelNode
  | DialogueNode
  | NarrationNode
  | CommandNode
  | DefineNode
  | DefaultNode
  | ScreenNode
  | InitBlockNode
  | PythonBlockNode
  | PythonLineNode
  | IfBlockNode
  | MenuNode
  | MenuChoiceNode
  | ImageDefNode
  | TransformDefNode
  | StyleDefNode
  | TestcaseNode
  | TranslateNode
  | CommentNode
  | BlankNode
  | ForBlockNode
  | WhileBlockNode
  | UnknownNode;

export interface ParsedFile {
  file: string;
  nodes: RenpyNode[];
  labels: Map<string, LabelNode>;
  screens: Map<string, ScreenNode>;
  characters: Map<string, DefineNode>;
  images: Map<string, ImageDefNode>;
  transforms: Map<string, TransformDefNode>;
  defines: Map<string, DefineNode>;
  defaults: Map<string, DefaultNode>;
  testcases: Map<string, TestcaseNode>;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  range: Range;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Project-wide index
 */
export interface ProjectIndex {
  /** file path -> parsed file */
  files: Map<string, ParsedFile>;
  /** label_name -> definitions */
  labels: Map<string, { file: string; node: LabelNode }[]>;
  /** screen_name -> definitions */
  screens: Map<string, { file: string; node: ScreenNode }[]>;
  /** character variable -> define node */
  characters: Map<string, { file: string; node: DefineNode }>;
  /** image_name -> definitions */
  images: Map<string, { file: string; node: ImageDefNode }[]>;
  /** transform_name -> definitions */
  transforms: Map<string, { file: string; node: TransformDefNode }>;
  /** define/default variables */
  variables: Map<string, { file: string; node: DefineNode | DefaultNode }>;
  /** testcase_name -> node */
  testcases: Map<string, { file: string; node: TestcaseNode }>;
  /** all asset file paths (relative to game/) */
  assetFiles: Set<string>;
}

/**
 * Commands that reference labels (for diagnostics, CodeLens, etc.)
 */
export const LABEL_REF_COMMANDS = new Set(['jump', 'call']);

/**
 * Character() constructor regex for define statements
 */
export const CHARACTER_DEF_RE = /^Character\s*\(/;
