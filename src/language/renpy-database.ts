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
  // ══════════════════════════════════════════════════════════
  //  Statements (kind='statement')
  // ══════════════════════════════════════════════════════════

  // ── Core ──
  s('label', 'label name(params):', 'Define a label (entry point for jumps/calls).', 'ラベルを定義（jump/callのエントリポイント）。'),
  s('jump', 'jump label_name', 'Jump to a label (does not return).', 'ラベルにジャンプ（戻らない）。'),
  s('call', 'call label_name', 'Call a label (returns when done).', 'ラベルを呼び出し（完了後に戻る）。'),
  s('return', 'return [expression]', 'Return from a call.', 'callから戻る。'),
  s('menu', 'menu:', 'Present choices to the player.', 'プレイヤーに選択肢を表示。'),
  s('pass', 'pass', 'Do nothing (placeholder).', '何もしない（プレースホルダー）。'),
  s('extend', 'extend "text"', 'Extend the previous dialogue line.', '直前のセリフを延長。'),

  // ── Display ──
  s('scene', 'scene image [at transform]', 'Clear images and show a new background.', '画像をクリアして新しい背景を表示。'),
  s('show', 'show image [at transform]', 'Show an image on the screen.', '画面に画像を表示。'),
  s('show layer', 'show layer name [at transform]', 'Apply a transform to an entire layer.', 'レイヤー全体にトランスフォームを適用。'),
  s('hide', 'hide image', 'Hide an image from the screen.', '画面から画像を非表示。'),
  s('camera', 'camera [layer] [at transform]', 'Apply a transform to a camera/layer.', 'カメラ/レイヤーにトランスフォームを適用。'),
  s('with', 'with transition', 'Apply a transition effect.', 'トランジション効果を適用。'),
  s('window', 'window show|hide|auto', 'Control the dialogue window.', 'ダイアログウィンドウを制御。'),
  s('pause', 'pause [duration]', 'Pause and wait for click or duration.', 'クリックまたは指定時間まで待機。'),

  // ── Audio ──
  s('play', 'play channel "file" [fadein/fadeout]', 'Play audio on a channel.', 'チャンネルでオーディオを再生。'),
  s('stop', 'stop channel [fadeout]', 'Stop audio on a channel.', 'チャンネルのオーディオを停止。'),
  s('queue', 'queue channel "file"', 'Queue audio on a channel.', 'チャンネルにオーディオをキュー。'),
  s('voice', 'voice "file"', 'Play a voice clip.', 'ボイスクリップを再生。'),
  s('voice sustain', 'voice sustain', 'Sustain current voice through next interaction.', '次のインタラクションまでボイスを持続。'),

  // ── Screen statements ──
  s('show screen', 'show screen name(args)', 'Show a screen.', 'スクリーンを表示。'),
  s('call screen', 'call screen name(args)', 'Call a screen and wait for result.', 'スクリーンを呼び出して結果を待つ。'),
  s('hide screen', 'hide screen name', 'Hide a screen.', 'スクリーンを非表示。'),

  // ── NVL ──
  s('nvl clear', 'nvl clear', 'Clear the NVL-mode text window.', 'NVLモードのテキストウィンドウをクリア。'),
  s('nvl show', 'nvl show [transition]', 'Show the NVL window with transition.', 'NVLウィンドウをトランジション付きで表示。'),
  s('nvl hide', 'nvl hide [transition]', 'Hide the NVL window with transition.', 'NVLウィンドウをトランジション付きで非表示。'),

  // ── Variables ──
  s('define', 'define name = value', 'Define a constant variable (not saved).', '定数変数を定義（セーブされない）。'),
  s('default', 'default name = value', 'Define a saveable variable with a default value.', 'デフォルト値を持つセーブ可能な変数を定義。'),
  s('$', '$ python_expression', 'One-line Python statement.', '1行Pythonステートメント。'),

  // ── Definitions ──
  s('image', 'image name = "file"', 'Define a named image.', '名前付き画像を定義。'),
  s('layeredimage', 'layeredimage name:', 'Define a layered image with automatic attribute-based compositing.', 'レイヤードイメージを定義（属性ベースの自動合成）。'),
  s('screen', 'screen name(params):', 'Define a screen for UI display.', 'UI表示用のスクリーンを定義。'),
  s('transform', 'transform name(params):', 'Define a transform (animation).', 'トランスフォーム（アニメーション）を定義。'),
  s('style', 'style name [is parent]:', 'Define or modify a style.', 'スタイルを定義・変更。'),
  s('translate', 'translate language identifier:', 'Translation block.', '翻訳ブロック。'),
  s('translate strings', 'translate language strings:', 'Translation strings block.', '翻訳文字列ブロック。'),
  s('translate python', 'translate language python:', 'Translation Python block.', '翻訳Pythonブロック。'),
  s('translate style', 'translate language style:', 'Translation style block.', '翻訳スタイルブロック。'),
  s('testcase', 'testcase name:', 'Define a test case.', 'テストケースを定義。'),
  s('testsuite', 'testsuite name:', 'Define a test suite.', 'テストスイートを定義。'),

  // ── Python ──
  s('init', 'init [priority] [python]:', 'Init block (runs at load time).', '初期化ブロック（ロード時に実行）。'),
  s('init offset', 'init offset = priority', 'Set init priority offset for this file.', 'ファイルのinit優先度オフセットを設定。'),
  s('python', 'python:', 'Python block.', 'Pythonブロック。'),
  s('early python', 'python early:', 'Early Python block (runs before other init).', '早期Pythonブロック（他のinitより先に実行）。'),

  // ── Control flow ──
  s('if', 'if condition:', 'Conditional branch.', '条件分岐。'),
  s('elif', 'elif condition:', 'Else-if branch.', 'else-if分岐。'),
  s('else', 'else:', 'Else branch.', 'else分岐。'),
  s('for', 'for var in iterable:', 'For loop.', 'forループ。'),
  s('while', 'while condition:', 'While loop.', 'whileループ。'),

  // ── Directives ──
  s('rpy monologue', 'rpy monologue [double|single|none]', 'Set monologue delimiter mode.', 'モノローグ区切りモードを設定。'),
  s('rpy python', 'rpy python 3', 'Set Python version for this file.', 'ファイルのPythonバージョンを設定。'),

  // ══════════════════════════════════════════════════════════
  //  Screen language widgets (kind='screen')
  // ══════════════════════════════════════════════════════════
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
  s('imagemap', 'imagemap:', 'Image map container.', 'イメージマップコンテナ。', 'screen'),
  s('hotspot', 'hotspot (x, y, w, h) action Action', 'Imagemap hotspot region.', 'イメージマップのホットスポット領域。', 'screen'),
  s('hotbar', 'hotbar (x, y, w, h) value BarValue', 'Imagemap hotbar region.', 'イメージマップのホットバー領域。', 'screen'),
  s('on', 'on "event" action Action', 'Event handler (show, hide, replace, replaced).', 'イベントハンドラ（show, hide, replace, replaced）。', 'screen'),
  s('showif', 'showif condition:', 'Conditional show with ATL transitions.', 'ATLトランジション付き条件表示。', 'screen'),
  s('dismiss', 'dismiss action Action', 'Dismiss behavior (click to dismiss).', 'ディスミス動作（クリックで閉じる）。', 'screen'),
  s('nearrect', 'nearrect:', 'Position near a focus rectangle.', 'フォーカス矩形の近くに配置。', 'screen'),
  s('label', 'label "text"', 'Label widget (text with window).', 'ラベルウィジェット（ウィンドウ付きテキスト）。', 'screen'),

  // ══════════════════════════════════════════════════════════
  //  Transitions — pre-defined instances (kind='transition')
  // ══════════════════════════════════════════════════════════

  // ── Basic ──
  s('dissolve', 'dissolve', 'Dissolve transition (0.5s).', 'ディゾルブトランジション（0.5秒）。', 'transition'),
  s('fade', 'fade', 'Fade to black then to new scene.', '黒へフェードして新シーンへ。', 'transition'),
  s('pixellate', 'pixellate', 'Pixellate transition.', 'ピクセレートトランジション。', 'transition'),

  // ── Wipe ──
  s('wipeleft', 'wipeleft', 'Wipe left transition.', '左ワイプトランジション。', 'transition'),
  s('wiperight', 'wiperight', 'Wipe right transition.', '右ワイプトランジション。', 'transition'),
  s('wipeup', 'wipeup', 'Wipe up transition.', '上ワイプトランジション。', 'transition'),
  s('wipedown', 'wipedown', 'Wipe down transition.', '下ワイプトランジション。', 'transition'),

  // ── Slide ──
  s('slideleft', 'slideleft', 'Slide left transition.', '左スライドトランジション。', 'transition'),
  s('slideright', 'slideright', 'Slide right transition.', '右スライドトランジション。', 'transition'),
  s('slideup', 'slideup', 'Slide up transition.', '上スライドトランジション。', 'transition'),
  s('slidedown', 'slidedown', 'Slide down transition.', '下スライドトランジション。', 'transition'),
  s('slideawayleft', 'slideawayleft', 'Slide away left transition.', '左スライドアウェイトランジション。', 'transition'),
  s('slideawayright', 'slideawayright', 'Slide away right transition.', '右スライドアウェイトランジション。', 'transition'),
  s('slideawayup', 'slideawayup', 'Slide away up transition.', '上スライドアウェイトランジション。', 'transition'),
  s('slideawaydown', 'slideawaydown', 'Slide away down transition.', '下スライドアウェイトランジション。', 'transition'),

  // ── Iris ──
  s('irisin', 'irisin', 'Iris in transition.', 'アイリスイントランジション。', 'transition'),
  s('irisout', 'irisout', 'Iris out transition.', 'アイリスアウトトランジション。', 'transition'),

  // ── Push ──
  s('pushleft', 'pushleft', 'Push left transition.', '左プッシュトランジション。', 'transition'),
  s('pushright', 'pushright', 'Push right transition.', '右プッシュトランジション。', 'transition'),
  s('pushup', 'pushup', 'Push up transition.', '上プッシュトランジション。', 'transition'),
  s('pushdown', 'pushdown', 'Push down transition.', '下プッシュトランジション。', 'transition'),

  // ── Move ──
  s('move', 'move', 'Move transition (0.5s).', 'ムーブトランジション（0.5秒）。', 'transition'),
  s('moveinright', 'moveinright', 'Move in from right.', '右から移動イン。', 'transition'),
  s('moveinleft', 'moveinleft', 'Move in from left.', '左から移動イン。', 'transition'),
  s('moveintop', 'moveintop', 'Move in from top.', '上から移動イン。', 'transition'),
  s('moveinbottom', 'moveinbottom', 'Move in from bottom.', '下から移動イン。', 'transition'),
  s('moveoutright', 'moveoutright', 'Move out to right.', '右へ移動アウト。', 'transition'),
  s('moveoutleft', 'moveoutleft', 'Move out to left.', '左へ移動アウト。', 'transition'),
  s('moveouttop', 'moveouttop', 'Move out to top.', '上へ移動アウト。', 'transition'),
  s('moveoutbottom', 'moveoutbottom', 'Move out to bottom.', '下へ移動アウト。', 'transition'),

  // ── Ease ──
  s('ease', 'ease', 'Ease move transition (0.5s).', 'イーズムーブトランジション（0.5秒）。', 'transition'),
  s('easeinright', 'easeinright', 'Ease in from right.', '右からイーズイン。', 'transition'),
  s('easeinleft', 'easeinleft', 'Ease in from left.', '左からイーズイン。', 'transition'),
  s('easeintop', 'easeintop', 'Ease in from top.', '上からイーズイン。', 'transition'),
  s('easeinbottom', 'easeinbottom', 'Ease in from bottom.', '下からイーズイン。', 'transition'),
  s('easeoutright', 'easeoutright', 'Ease out to right.', '右へイーズアウト。', 'transition'),
  s('easeoutleft', 'easeoutleft', 'Ease out to left.', '左へイーズアウト。', 'transition'),
  s('easeouttop', 'easeouttop', 'Ease out to top.', '上へイーズアウト。', 'transition'),
  s('easeoutbottom', 'easeoutbottom', 'Ease out to bottom.', '下へイーズアウト。', 'transition'),

  // ── Other ──
  s('zoomin', 'zoomin', 'Zoom in transition.', 'ズームイントランジション。', 'transition'),
  s('zoomout', 'zoomout', 'Zoom out transition.', 'ズームアウトトランジション。', 'transition'),
  s('zoominout', 'zoominout', 'Zoom in then out transition.', 'ズームイン/アウトトランジション。', 'transition'),
  s('vpunch', 'vpunch', 'Vertical screen shake.', '縦方向の画面揺れ。', 'transition'),
  s('hpunch', 'hpunch', 'Horizontal screen shake.', '横方向の画面揺れ。', 'transition'),
  s('blinds', 'blinds', 'Blinds transition.', 'ブラインドトランジション。', 'transition'),
  s('squares', 'squares', 'Squares transition.', 'スクエアトランジション。', 'transition'),
  s('swing', 'swing', 'Swing/flip transition.', 'スイング/フリップトランジション。', 'transition'),

  // ── Transition constructors ──
  s('Dissolve', 'Dissolve(duration)', 'Dissolve with custom duration.', 'カスタム時間のディゾルブ。', 'transition'),
  s('Fade', 'Fade(out, hold, in)', 'Fade with custom timing.', 'カスタムタイミングのフェード。', 'transition'),
  s('MoveTransition', 'MoveTransition(duration)', 'Move transition constructor.', 'ムーブトランジションコンストラクタ。', 'transition'),
  s('ImageDissolve', 'ImageDissolve("image", duration)', 'Image-based dissolve.', '画像ベースのディゾルブ。', 'transition'),
  s('Pixellate', 'Pixellate(time, steps)', 'Pixellate transition constructor.', 'ピクセレートトランジションコンストラクタ。', 'transition'),
  s('CropMove', 'CropMove(time, mode)', 'Crop-based move transition.', 'クロップベースのムーブトランジション。', 'transition'),
  s('PushMove', 'PushMove(time, mode)', 'Push move transition.', 'プッシュムーブトランジション。', 'transition'),
  s('AlphaDissolve', 'AlphaDissolve(control, delay)', 'Alpha channel dissolve.', 'アルファチャンネルディゾルブ。', 'transition'),
  s('MultipleTransition', 'MultipleTransition([trans1, scene, trans2, ...])', 'Sequence of transitions.', 'トランジションのシーケンス。', 'transition'),
  s('ComposeTransition', 'ComposeTransition(trans, before, after)', 'Compose transitions together.', 'トランジションの合成。', 'transition'),
  s('Swing', 'Swing(delay, vertical, reverse)', '3D swing/flip transition.', '3Dスイング/フリップトランジション。', 'transition'),

  // ══════════════════════════════════════════════════════════
  //  Actions (kind='action')
  // ══════════════════════════════════════════════════════════

  // ── Control ──
  s('Show', 'Show("screen_name")', 'Show a screen.', 'スクリーンを表示。', 'action'),
  s('Hide', 'Hide("screen_name")', 'Hide a screen.', 'スクリーンを非表示。', 'action'),
  s('ToggleScreen', 'ToggleScreen("screen_name")', 'Toggle screen visibility.', 'スクリーンの表示をトグル。', 'action'),
  s('ShowTransient', 'ShowTransient("screen_name")', 'Show a transient screen.', 'トランジェントスクリーンを表示。', 'action'),
  s('Jump', 'Jump("label_name")', 'Jump to a label (from screen).', 'ラベルにジャンプ（スクリーンから）。', 'action'),
  s('Call', 'Call("label_name")', 'Call a label (from screen).', 'ラベルを呼び出し（スクリーンから）。', 'action'),
  s('Return', 'Return(value)', 'Return from screen/call.', 'スクリーン/callから戻る。', 'action'),
  s('NullAction', 'NullAction()', 'Action that does nothing.', '何もしないアクション。', 'action'),
  s('If', 'If(condition, true_action, false_action)', 'Conditional action.', '条件付きアクション。', 'action'),
  s('Function', 'Function(callable, *args, **kwargs)', 'Call a Python function.', 'Python関数を呼び出し。', 'action'),
  s('Confirm', 'Confirm("message", yes_action, no_action)', 'Show confirmation dialog.', '確認ダイアログを表示。', 'action'),
  s('Notify', 'Notify("message")', 'Display a notification message.', '通知メッセージを表示。', 'action'),
  s('With', 'With(transition)', 'Apply a transition.', 'トランジションを適用。', 'action'),

  // ── Data ──
  s('SetVariable', 'SetVariable("name", value)', 'Set a variable value.', '変数の値を設定。', 'action'),
  s('SetField', 'SetField(obj, "field", value)', 'Set an object field.', 'オブジェクトのフィールドを設定。', 'action'),
  s('SetDict', 'SetDict(dict, "key", value)', 'Set a dict/list value.', '辞書/リストの値を設定。', 'action'),
  s('SetScreenVariable', 'SetScreenVariable("name", value)', 'Set a screen-local variable.', 'スクリーンローカル変数を設定。', 'action'),
  s('SetLocalVariable', 'SetLocalVariable("name", value)', 'Set a local variable.', 'ローカル変数を設定。', 'action'),
  s('ToggleVariable', 'ToggleVariable("name")', 'Toggle a boolean variable.', 'ブール変数をトグル。', 'action'),
  s('ToggleField', 'ToggleField(obj, "field")', 'Toggle an object field.', 'オブジェクトフィールドをトグル。', 'action'),
  s('ToggleDict', 'ToggleDict(dict, "key")', 'Toggle a dict/list value.', '辞書/リストの値をトグル。', 'action'),
  s('ToggleScreenVariable', 'ToggleScreenVariable("name")', 'Toggle a screen-local variable.', 'スクリーンローカル変数をトグル。', 'action'),
  s('ToggleLocalVariable', 'ToggleLocalVariable("name")', 'Toggle a local variable.', 'ローカル変数をトグル。', 'action'),
  s('CycleVariable', 'CycleVariable("name", [values])', 'Cycle through variable values.', '変数値を循環。', 'action'),
  s('CycleField', 'CycleField(obj, "field", [values])', 'Cycle through field values.', 'フィールド値を循環。', 'action'),
  s('CycleDict', 'CycleDict(dict, "key", [values])', 'Cycle through dict values.', '辞書値を循環。', 'action'),
  s('CycleScreenVariable', 'CycleScreenVariable("name", [values])', 'Cycle through screen variable values.', 'スクリーン変数値を循環。', 'action'),
  s('CycleLocalVariable', 'CycleLocalVariable("name", [values])', 'Cycle through local variable values.', 'ローカル変数値を循環。', 'action'),
  s('IncrementVariable', 'IncrementVariable("name", amount)', 'Increment a variable.', '変数をインクリメント。', 'action'),
  s('IncrementField', 'IncrementField(obj, "field", amount)', 'Increment a field.', 'フィールドをインクリメント。', 'action'),
  s('IncrementDict', 'IncrementDict(dict, "key", amount)', 'Increment a dict value.', '辞書値をインクリメント。', 'action'),
  s('IncrementScreenVariable', 'IncrementScreenVariable("name", amount)', 'Increment a screen variable.', 'スクリーン変数をインクリメント。', 'action'),
  s('IncrementLocalVariable', 'IncrementLocalVariable("name", amount)', 'Increment a local variable.', 'ローカル変数をインクリメント。', 'action'),
  s('AddToSet', 'AddToSet(set, value)', 'Add a value to a set/list.', 'セット/リストに値を追加。', 'action'),
  s('RemoveFromSet', 'RemoveFromSet(set, value)', 'Remove a value from a set/list.', 'セット/リストから値を削除。', 'action'),
  s('ToggleSetMembership', 'ToggleSetMembership(set, value)', 'Toggle set membership.', 'セットメンバーシップをトグル。', 'action'),

  // ── Audio ──
  s('Play', 'Play("channel", "file")', 'Play audio action.', 'オーディオ再生アクション。', 'action'),
  s('Stop', 'Stop("channel")', 'Stop audio action.', 'オーディオ停止アクション。', 'action'),
  s('Queue', 'Queue("channel", "file")', 'Queue audio action.', 'オーディオキューアクション。', 'action'),
  s('SetMixer', 'SetMixer("mixer", volume)', 'Set mixer volume.', 'ミキサー音量を設定。', 'action'),
  s('SetMute', 'SetMute("mixer", muted)', 'Set mute status for a mixer.', 'ミキサーのミュート状態を設定。', 'action'),
  s('ToggleMute', 'ToggleMute("mixer")', 'Toggle mute for a mixer.', 'ミキサーのミュートをトグル。', 'action'),
  s('PauseAudio', 'PauseAudio("channel", paused)', 'Pause/unpause an audio channel.', 'オーディオチャンネルの一時停止/再開。', 'action'),

  // ── Menu / Navigation ──
  s('Quit', 'Quit(confirm=True)', 'Quit the game.', 'ゲームを終了。', 'action'),
  s('MainMenu', 'MainMenu(confirm=True)', 'Return to main menu.', 'メインメニューに戻る。', 'action'),
  s('Start', 'Start("label")', 'Start a new game.', '新しいゲームを開始。', 'action'),
  s('Continue', 'Continue()', 'Continue from the last save.', '最後のセーブからコンティニュー。', 'action'),
  s('ShowMenu', 'ShowMenu("screen")', 'Show a game menu screen.', 'ゲームメニュースクリーンを表示。', 'action'),
  s('Skip', 'Skip()', 'Start skipping.', 'スキップを開始。', 'action'),
  s('Help', 'Help("file")', 'Display help.', 'ヘルプを表示。', 'action'),

  // ── File / Save ──
  s('Preference', 'Preference("name", "value")', 'Set a preference.', 'プリファレンスを設定。', 'action'),
  s('FileAction', 'FileAction(slot)', 'Save/load file action.', 'セーブ/ロードファイルアクション。', 'action'),
  s('FileSave', 'FileSave(slot)', 'Save to slot.', 'スロットにセーブ。', 'action'),
  s('FileLoad', 'FileLoad(slot)', 'Load from slot.', 'スロットからロード。', 'action'),
  s('FileDelete', 'FileDelete(slot)', 'Delete save slot.', 'セーブスロットを削除。', 'action'),
  s('FilePage', 'FilePage(page)', 'Set the file page.', 'ファイルページを設定。', 'action'),
  s('FilePageNext', 'FilePageNext()', 'Go to the next file page.', '次のファイルページへ。', 'action'),
  s('FilePagePrevious', 'FilePagePrevious()', 'Go to the previous file page.', '前のファイルページへ。', 'action'),
  s('FileTakeScreenshot', 'FileTakeScreenshot()', 'Take a save screenshot.', 'セーブ用スクリーンショットを撮影。', 'action'),
  s('QuickSave', 'QuickSave()', 'Quick save.', 'クイックセーブ。', 'action'),
  s('QuickLoad', 'QuickLoad()', 'Quick load.', 'クイックロード。', 'action'),

  // ── Rollback ──
  s('Rollback', 'Rollback()', 'Rollback one step.', '1ステップロールバック。', 'action'),
  s('RollForward', 'RollForward()', 'Roll forward one step.', '1ステップロールフォワード。', 'action'),
  s('RollbackToIdentifier', 'RollbackToIdentifier(id)', 'Rollback to a history identifier.', '履歴IDまでロールバック。', 'action'),

  // ── Other ──
  s('Screenshot', 'Screenshot()', 'Take a screenshot.', 'スクリーンショットを撮影。', 'action'),
  s('HideInterface', 'HideInterface()', 'Hide the interface until click.', 'クリックまでインターフェースを非表示。', 'action'),
  s('OpenURL', 'OpenURL("url")', 'Open a URL in browser.', 'ブラウザでURLを開く。', 'action'),
  s('OpenDirectory', 'OpenDirectory("path")', 'Open directory in file browser.', 'ファイルブラウザでディレクトリを開く。', 'action'),
  s('Language', 'Language("language")', 'Change game language.', 'ゲーム言語を変更。', 'action'),
  s('Replay', 'Replay("label")', 'Start a replay.', 'リプレイを開始。', 'action'),
  s('EndReplay', 'EndReplay()', 'End current replay.', '現在のリプレイを終了。', 'action'),
  s('RestartStatement', 'RestartStatement()', 'Re-run the current statement.', '現在のステートメントを再実行。', 'action'),
  s('Scroll', 'Scroll("direction")', 'Scroll a bar or viewport.', 'バーまたはビューポートをスクロール。', 'action'),
  s('MouseMove', 'MouseMove(x, y, duration)', 'Move mouse pointer.', 'マウスポインターを移動。', 'action'),
  s('QueueEvent', 'QueueEvent("event")', 'Queue an event.', 'イベントをキュー。', 'action'),
  s('SelectedIf', 'SelectedIf(action)', 'Mark action as selected conditionally.', 'アクションを条件付きで選択状態に。', 'action'),
  s('SensitiveIf', 'SensitiveIf(action)', 'Mark action as sensitive conditionally.', 'アクションを条件付きで感応状態に。', 'action'),
  s('InvertSelected', 'InvertSelected(action)', 'Invert the selection state of an action.', 'アクションの選択状態を反転。', 'action'),
  s('CopyToClipboard', 'CopyToClipboard("text")', 'Copy text to clipboard.', 'テキストをクリップボードにコピー。', 'action'),
  s('CaptureFocus', 'CaptureFocus("name")', 'Capture a focus rectangle.', 'フォーカス矩形をキャプチャ。', 'action'),
  s('ToggleFocus', 'ToggleFocus("name")', 'Toggle a focus rectangle.', 'フォーカス矩形をトグル。', 'action'),
  s('ClearFocus', 'ClearFocus("name")', 'Clear a focus rectangle.', 'フォーカス矩形をクリア。', 'action'),
  s('ExecJS', 'ExecJS("code")', 'Execute JavaScript (web builds).', 'JavaScriptを実行（Webビルド）。', 'action'),

  // ══════════════════════════════════════════════════════════
  //  ATL keywords and warpers (kind='atl')
  // ══════════════════════════════════════════════════════════

  // ── Warpers (basic) ──
  s('linear', 'linear duration', 'Linear interpolation.', '線形補間。', 'atl'),
  s('ease', 'ease duration', 'Ease in and out interpolation.', 'イーズイン/アウト補間。', 'atl'),
  s('easein', 'easein duration', 'Ease in interpolation.', 'イーズイン補間。', 'atl'),
  s('easeout', 'easeout duration', 'Ease out interpolation.', 'イーズアウト補間。', 'atl'),
  s('instant', 'instant', 'Instant (no interpolation).', '即座に変更（補間なし）。', 'atl'),

  // ── Warpers (quad) ──
  s('ease_quad', 'ease_quad duration', 'Ease in/out quadratic.', 'イーズイン/アウト（二次）。', 'atl'),
  s('easein_quad', 'easein_quad duration', 'Ease in quadratic.', 'イーズイン（二次）。', 'atl'),
  s('easeout_quad', 'easeout_quad duration', 'Ease out quadratic.', 'イーズアウト（二次）。', 'atl'),

  // ── Warpers (cubic) ──
  s('ease_cubic', 'ease_cubic duration', 'Ease in/out cubic.', 'イーズイン/アウト（三次）。', 'atl'),
  s('easein_cubic', 'easein_cubic duration', 'Ease in cubic.', 'イーズイン（三次）。', 'atl'),
  s('easeout_cubic', 'easeout_cubic duration', 'Ease out cubic.', 'イーズアウト（三次）。', 'atl'),

  // ── Warpers (quart) ──
  s('ease_quart', 'ease_quart duration', 'Ease in/out quartic.', 'イーズイン/アウト（四次）。', 'atl'),
  s('easein_quart', 'easein_quart duration', 'Ease in quartic.', 'イーズイン（四次）。', 'atl'),
  s('easeout_quart', 'easeout_quart duration', 'Ease out quartic.', 'イーズアウト（四次）。', 'atl'),

  // ── Warpers (quint) ──
  s('ease_quint', 'ease_quint duration', 'Ease in/out quintic.', 'イーズイン/アウト（五次）。', 'atl'),
  s('easein_quint', 'easein_quint duration', 'Ease in quintic.', 'イーズイン（五次）。', 'atl'),
  s('easeout_quint', 'easeout_quint duration', 'Ease out quintic.', 'イーズアウト（五次）。', 'atl'),

  // ── Warpers (expo) ──
  s('ease_expo', 'ease_expo duration', 'Ease in/out exponential.', 'イーズイン/アウト（指数）。', 'atl'),
  s('easein_expo', 'easein_expo duration', 'Ease in exponential.', 'イーズイン（指数）。', 'atl'),
  s('easeout_expo', 'easeout_expo duration', 'Ease out exponential.', 'イーズアウト（指数）。', 'atl'),

  // ── Warpers (circ) ──
  s('ease_circ', 'ease_circ duration', 'Ease in/out circular.', 'イーズイン/アウト（円形）。', 'atl'),
  s('easein_circ', 'easein_circ duration', 'Ease in circular.', 'イーズイン（円形）。', 'atl'),
  s('easeout_circ', 'easeout_circ duration', 'Ease out circular.', 'イーズアウト（円形）。', 'atl'),

  // ── Warpers (back) ──
  s('ease_back', 'ease_back duration', 'Ease in/out with overshoot.', 'イーズイン/アウト（オーバーシュート）。', 'atl'),
  s('easein_back', 'easein_back duration', 'Ease in with overshoot.', 'イーズイン（オーバーシュート）。', 'atl'),
  s('easeout_back', 'easeout_back duration', 'Ease out with overshoot.', 'イーズアウト（オーバーシュート）。', 'atl'),

  // ── Warpers (elastic) ──
  s('ease_elastic', 'ease_elastic duration', 'Ease in/out elastic.', 'イーズイン/アウト（弾性）。', 'atl'),
  s('easein_elastic', 'easein_elastic duration', 'Ease in elastic.', 'イーズイン（弾性）。', 'atl'),
  s('easeout_elastic', 'easeout_elastic duration', 'Ease out elastic.', 'イーズアウト（弾性）。', 'atl'),

  // ── Warpers (bounce) ──
  s('ease_bounce', 'ease_bounce duration', 'Ease in/out bounce.', 'イーズイン/アウト（バウンス）。', 'atl'),
  s('easein_bounce', 'easein_bounce duration', 'Ease in bounce.', 'イーズイン（バウンス）。', 'atl'),
  s('easeout_bounce', 'easeout_bounce duration', 'Ease out bounce.', 'イーズアウト（バウンス）。', 'atl'),

  // ── ATL statements ──
  s('pause', 'pause duration', 'Pause for duration in ATL.', 'ATL内で指定時間だけ待機。', 'atl'),
  s('repeat', 'repeat [count]', 'Repeat the ATL block.', 'ATLブロックを繰り返し。', 'atl'),
  s('block', 'block:', 'ATL block.', 'ATLブロック。', 'atl'),
  s('parallel', 'parallel:', 'Parallel ATL block.', '並列ATLブロック。', 'atl'),
  s('choice', 'choice:', 'Random choice in ATL.', 'ATLのランダム選択。', 'atl'),
  s('contains', 'contains:', 'ATL contains block.', 'ATL containsブロック。', 'atl'),
  s('on', 'on event:', 'ATL event handler (show, hide, replace, replaced).', 'ATLイベントハンドラ。', 'atl'),
  s('event', 'event name', 'Fire a custom ATL event.', 'カスタムATLイベントを発火。', 'atl'),
  s('function', 'function callable', 'Call a Python function from ATL.', 'ATLからPython関数を呼び出し。', 'atl'),
  s('animation', 'animation', 'Mark ATL as animation (not transform).', 'ATLをアニメーションとしてマーク。', 'atl'),
  s('time', 'time seconds', 'Set absolute time in ATL.', 'ATL内で絶対時間を設定。', 'atl'),

  // ══════════════════════════════════════════════════════════
  //  Classes (kind='class')
  // ══════════════════════════════════════════════════════════
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
