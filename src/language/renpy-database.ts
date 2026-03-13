/**
 * Ren'Py statement and keyword database.
 * Provides documentation and completion data for all Ren'Py statements.
 */

import { localize } from './i18n';

export interface StatementInfo {
  name: string;
  syntax: string;
  description: string;
  descriptionJa: string;
  kind: 'statement' | 'clause' | 'screen' | 'atl' | 'action' | 'transform' | 'transition' | 'class' | 'function' | 'property';
  detail?: string;
}

function s(name: string, syntax: string, desc: string, descJa: string, kind: StatementInfo['kind'] = 'statement', detail?: string): StatementInfo {
  return { name, syntax, description: desc, descriptionJa: descJa, kind, detail };
}

/**
 * Core Ren'Py statements database.
 */
export const RENPY_STATEMENTS: StatementInfo[] = [
  // ── Core statements ──
  s('label', 'label name(params):', 'Define a label (entry point for jumps/calls).', 'ラベルを定義（jump/callのエントリポイント）。'),
  s('jump', 'jump label_name', 'Jump to a label (does not return).', 'ラベルにジャンプ（戻らない）。'),
  s('call', 'call label_name', 'Call a label (returns when done).', 'ラベルを呼び出し（完了後に戻る）。'),
  s('return', 'return [expression]', 'Return from a call.', 'callから戻る。'),
  s('menu', 'menu:', 'Present choices to the player.', 'プレイヤーに選択肢を表示。'),
  s('pass', 'pass', 'Do nothing (placeholder).', '何もしない（プレースホルダー）。'),

  // ── Display ──
  s('scene', 'scene image [at transform]', 'Clear images and show a new background.', '画像をクリアして新しい背景を表示。'),
  s('show', 'show image [at transform]', 'Show an image on the screen.', '画面に画像を表示。'),
  s('hide', 'hide image', 'Hide an image from the screen.', '画面から画像を非表示。'),
  s('with', 'with transition', 'Apply a transition effect.', 'トランジション効果を適用。'),
  s('window', 'window show|hide|auto', 'Control the dialogue window.', 'ダイアログウィンドウを制御。'),

  // ── Audio ──
  s('play', 'play channel "file" [fadein/fadeout]', 'Play audio on a channel.', 'チャンネルでオーディオを再生。'),
  s('stop', 'stop channel [fadeout]', 'Stop audio on a channel.', 'チャンネルのオーディオを停止。'),
  s('queue', 'queue channel "file"', 'Queue audio on a channel.', 'チャンネルにオーディオをキュー。'),
  s('voice', 'voice "file"', 'Play a voice clip.', 'ボイスクリップを再生。'),

  // ── Variables ──
  s('define', 'define name = value', 'Define a constant variable (not saved).', '定数変数を定義（セーブされない）。'),
  s('default', 'default name = value', 'Define a saveable variable with a default value.', 'デフォルト値を持つセーブ可能な変数を定義。'),

  // ── Definitions ──
  s('image', 'image name = "file"', 'Define a named image.', '名前付き画像を定義。'),
  s('screen', 'screen name(params):', 'Define a screen for UI display.', 'UI表示用のスクリーンを定義。'),
  s('transform', 'transform name(params):', 'Define a transform (animation).', 'トランスフォーム（アニメーション）を定義。'),
  s('style', 'style name [is parent]:', 'Define or modify a style.', 'スタイルを定義・変更。'),
  s('translate', 'translate language identifier:', 'Translation block.', '翻訳ブロック。'),
  s('testcase', 'testcase name:', 'Define a test case.', 'テストケースを定義。'),

  // ── Python ──
  s('init', 'init [priority] [python]:', 'Init block (runs at load time).', '初期化ブロック（ロード時に実行）。'),
  s('python', 'python:', 'Python block.', 'Pythonブロック。'),

  // ── Control flow ──
  s('if', 'if condition:', 'Conditional branch.', '条件分岐。'),
  s('elif', 'elif condition:', 'Else-if branch.', 'else-if分岐。'),
  s('else', 'else:', 'Else branch.', 'else分岐。'),
  s('for', 'for var in iterable:', 'For loop.', 'forループ。'),
  s('while', 'while condition:', 'While loop.', 'whileループ。'),

  // ── Screen language ──
  s('text', 'text "string"', 'Display text in a screen.', 'スクリーンにテキストを表示。', 'screen'),
  s('add', 'add "image.png"', 'Add an image to a screen.', 'スクリーンに画像を追加。', 'screen'),
  s('textbutton', 'textbutton "label" action Action', 'A button with a text label.', 'テキストラベル付きボタン。', 'screen'),
  s('imagebutton', 'imagebutton idle "img" action Action', 'A button with image states.', '画像状態付きボタン。', 'screen'),
  s('button', 'button:', 'A generic button container.', '汎用ボタンコンテナ。', 'screen'),
  s('vbox', 'vbox:', 'Vertical box layout.', '垂直ボックスレイアウト。', 'screen'),
  s('hbox', 'hbox:', 'Horizontal box layout.', '水平ボックスレイアウト。', 'screen'),
  s('grid', 'grid cols rows:', 'Grid layout.', 'グリッドレイアウト。', 'screen'),
  s('fixed', 'fixed:', 'Fixed position layout.', '固定位置レイアウト。', 'screen'),
  s('frame', 'frame:', 'A frame container with background.', '背景付きフレームコンテナ。', 'screen'),
  s('window', 'window:', 'A window container.', 'ウィンドウコンテナ。', 'screen'),
  s('viewport', 'viewport:', 'Scrollable viewport.', 'スクロール可能なビューポート。', 'screen'),
  s('vpgrid', 'vpgrid:', 'Scrollable grid viewport.', 'スクロール可能なグリッドビューポート。', 'screen'),
  s('side', 'side "positions":', 'Side layout (e.g., "c l r").', 'サイドレイアウト。', 'screen'),
  s('bar', 'bar value BarValue', 'Horizontal bar/slider.', '水平バー/スライダー。', 'screen'),
  s('vbar', 'vbar value BarValue', 'Vertical bar/slider.', '垂直バー/スライダー。', 'screen'),
  s('null', 'null', 'Empty displayable (spacer).', '空のディスプレイアブル（スペーサー）。', 'screen'),
  s('timer', 'timer delay action Action', 'Timer that fires after delay.', '遅延後に発火するタイマー。', 'screen'),
  s('input', 'input', 'Text input field.', 'テキスト入力フィールド。', 'screen'),
  s('key', 'key "keyname" action Action', 'Keyboard binding.', 'キーボードバインディング。', 'screen'),
  s('mousearea', 'mousearea:', 'Mouse hover detection area.', 'マウスホバー検出エリア。', 'screen'),
  s('drag', 'drag:', 'Draggable element.', 'ドラッグ可能な要素。', 'screen'),
  s('draggroup', 'draggroup:', 'Group of draggable elements.', 'ドラッグ可能な要素のグループ。', 'screen'),
  s('use', 'use screen_name', 'Include another screen.', '別のスクリーンを組み込み。', 'screen'),
  s('transclude', 'transclude', 'Place for child content.', '子コンテンツのプレースホルダー。', 'screen'),
  s('has', 'has widget', 'Set a single-child container.', 'シングルチャイルドコンテナを設定。', 'screen'),

  // ── Common transitions ──
  s('dissolve', 'dissolve', 'Dissolve transition (default 0.5s).', 'ディゾルブトランジション。', 'transition'),
  s('fade', 'fade', 'Fade to black then to new scene.', '黒へフェードして新シーンへ。', 'transition'),
  s('Dissolve', 'Dissolve(duration)', 'Dissolve with custom duration.', 'カスタム時間のディゾルブ。', 'transition'),
  s('Fade', 'Fade(out, hold, in)', 'Fade with custom timing.', 'カスタムタイミングのフェード。', 'transition'),
  s('MoveTransition', 'MoveTransition(duration)', 'Move transition.', 'ムーブトランジション。', 'transition'),
  s('ImageDissolve', 'ImageDissolve("image", duration)', 'Image-based dissolve.', '画像ベースのディゾルブ。', 'transition'),

  // ── Common actions ──
  s('Show', 'Show("screen_name")', 'Show a screen.', 'スクリーンを表示。', 'action'),
  s('Hide', 'Hide("screen_name")', 'Hide a screen.', 'スクリーンを非表示。', 'action'),
  s('Jump', 'Jump("label_name")', 'Jump to a label (from screen).', 'ラベルにジャンプ（スクリーンから）。', 'action'),
  s('Call', 'Call("label_name")', 'Call a label (from screen).', 'ラベルを呼び出し（スクリーンから）。', 'action'),
  s('Return', 'Return(value)', 'Return from screen/call.', 'スクリーン/callから戻る。', 'action'),
  s('NullAction', 'NullAction()', 'Action that does nothing.', '何もしないアクション。', 'action'),
  s('SetVariable', 'SetVariable("name", value)', 'Set a variable value.', '変数の値を設定。', 'action'),
  s('SetField', 'SetField(obj, "field", value)', 'Set an object field.', 'オブジェクトのフィールドを設定。', 'action'),
  s('ToggleVariable', 'ToggleVariable("name")', 'Toggle a boolean variable.', 'ブール変数をトグル。', 'action'),
  s('If', 'If(condition, true_action, false_action)', 'Conditional action.', '条件付きアクション。', 'action'),
  s('Play', 'Play("channel", "file")', 'Play audio action.', 'オーディオ再生アクション。', 'action'),
  s('Stop', 'Stop("channel")', 'Stop audio action.', 'オーディオ停止アクション。', 'action'),
  s('Quit', 'Quit(confirm=True)', 'Quit the game.', 'ゲームを終了。', 'action'),
  s('MainMenu', 'MainMenu(confirm=True)', 'Return to main menu.', 'メインメニューに戻る。', 'action'),
  s('Start', 'Start("label")', 'Start a new game.', '新しいゲームを開始。', 'action'),
  s('ShowMenu', 'ShowMenu("screen")', 'Show a game menu screen.', 'ゲームメニュースクリーンを表示。', 'action'),
  s('Preference', 'Preference("name", "value")', 'Set a preference.', 'プリファレンスを設定。', 'action'),
  s('FileAction', 'FileAction(slot)', 'Save/load file action.', 'セーブ/ロードファイルアクション。', 'action'),
  s('FileSave', 'FileSave(slot)', 'Save to slot.', 'スロットにセーブ。', 'action'),
  s('FileLoad', 'FileLoad(slot)', 'Load from slot.', 'スロットからロード。', 'action'),
  s('FileDelete', 'FileDelete(slot)', 'Delete save slot.', 'セーブスロットを削除。', 'action'),
  s('Rollback', 'Rollback()', 'Rollback one step.', '1ステップロールバック。', 'action'),
  s('RollForward', 'RollForward()', 'Roll forward one step.', '1ステップロールフォワード。', 'action'),

  // ── ATL keywords ──
  s('linear', 'linear duration', 'Linear interpolation.', '線形補間。', 'atl'),
  s('ease', 'ease duration', 'Ease in and out interpolation.', 'イーズイン/アウト補間。', 'atl'),
  s('easein', 'easein duration', 'Ease in interpolation.', 'イーズイン補間。', 'atl'),
  s('easeout', 'easeout duration', 'Ease out interpolation.', 'イーズアウト補間。', 'atl'),
  s('pause', 'pause duration', 'Pause for duration.', '指定時間だけ待機。', 'atl'),
  s('repeat', 'repeat [count]', 'Repeat the ATL block.', 'ATLブロックを繰り返し。', 'atl'),
  s('block', 'block:', 'ATL block.', 'ATLブロック。', 'atl'),
  s('parallel', 'parallel:', 'Parallel ATL block.', '並列ATLブロック。', 'atl'),
  s('choice', 'choice:', 'Random choice in ATL.', 'ATLのランダム選択。', 'atl'),
  s('contains', 'contains:', 'ATL contains block.', 'ATL containsブロック。', 'atl'),

  // ── Classes ──
  s('Character', 'Character(name, **kwargs)', 'Define a character for dialogue.', 'ダイアログ用キャラクターを定義。', 'class'),
  s('DynamicCharacter', 'DynamicCharacter(name_expr)', 'Character with dynamic name.', '動的名前のキャラクター。', 'class'),
  s('ADVCharacter', 'ADVCharacter(name, **kwargs)', 'ADV-style character.', 'ADVスタイルキャラクター。', 'class'),
  s('NVLCharacter', 'NVLCharacter(name, **kwargs)', 'NVL-style character.', 'NVLスタイルキャラクター。', 'class'),
];

/** Statement lookup by name */
const STATEMENT_MAP = new Map<string, StatementInfo>();
for (const stmt of RENPY_STATEMENTS) {
  STATEMENT_MAP.set(stmt.name, stmt);
}

/**
 * Look up a statement by name.
 */
export function getStatementInfo(name: string): StatementInfo | undefined {
  return STATEMENT_MAP.get(name);
}

/**
 * Get localized description for a statement.
 */
export function getStatementDescription(info: StatementInfo): string {
  return localize(info.description, info.descriptionJa);
}

/**
 * Get statements filtered by kind.
 */
export function getStatementsByKind(kind: StatementInfo['kind']): StatementInfo[] {
  return RENPY_STATEMENTS.filter(s => s.kind === kind);
}
