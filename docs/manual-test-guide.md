# RenPy Code 手動テストガイド

> 対象ファイル: `the_question/game/script.rpy`（Ren'Py SDK同梱サンプル）
> 前提: RenPy Code拡張がインストール済み、the_questionプロジェクトをVSCodeで開いている

---

## A. コード補完（4.1〜4.7）

### A-1. jump 後のラベル名補完（4.1）
1. `script.rpy` の `label start:` ブロック内（例: 行45付近）に新しい行を追加
2. `    jump ` と入力（jumpの後にスペース）
3. **確認**: 補完リストが自動表示される
4. **確認**: `start`, `rightaway`, `later` 等プロジェクト内のラベル名が候補に含まれる
5. 候補を選んでEnterで挿入されることを確認
6. 入力をUndoして元に戻す

### A-2. call 後のラベル名補完（4.2）
1. 同じ場所で `    call ` と入力
2. **確認**: ラベル名の補完候補が表示される
3. Undoして戻す

### A-3. キャラクター変数のセリフ補完（4.3）
1. `label start:` ブロック内で新しい行を追加
2. `    s` と入力（インデント後にキャラ名の先頭文字）
3. **確認**: `s`（Sylvie）が補完候補に表示される
4. 選択すると `s "${1}"` のようにセリフテンプレートが展開される
5. Undoして戻す

### A-4. スクリーン名の補完（4.4）
1. `    show screen ` と入力
2. **確認**: 定義済みスクリーン名が候補に表示される
3. Undoして戻す

### A-5. Ren'Pyステートメント補完（4.5）
1. `label start:` ブロック内で `    la` と入力
2. **確認**: `label`, `layeredimage` 等の候補が表示される
3. 各候補に日本語のドキュメントが表示されることも確認
4. Undoして戻す

### A-5b. ATLキーワード補完
1. `transform` ブロック内で `    li` と入力
2. **確認**: `linear` が候補に表示される（Eventアイコン）
3. `    ease` と入力して `ease_bounce`, `ease_elastic` 等の変種が表示されることを確認
4. Undoして戻す

### A-6. 組み込みクラス補完（4.6）
1. ファイル先頭付近で `define x = Cha` と入力
2. **確認**: `Character` 等のクラス名が候補に表示される
3. Undoして戻す

### A-7. スクリーンキーワード補完（4.7）
1. 既存のscreen定義がなければ `screen test_screen():` を追加
2. そのブロック内で `    tex` と入力
3. **確認**: `text`, `textbutton` 等が候補に表示される
4. Undoして戻す

---

## B. 定義ジャンプ・参照検索（6.3〜6.5）

### B-1. スクリーン定義へのジャンプ（6.3）
1. `script.rpy` 内で `show screen` を使っている箇所を探す（なければ `    show screen say` と入力）
2. `say` の上にカーソルを置いてF12（定義へ移動）
3. **確認**: screens.rpyの `screen say` 定義にジャンプする
4. テスト用に入力した場合はUndoして戻す

### B-2. ラベルの参照一覧（6.4）
1. `script.rpy` 行10の `label start:` の `start` にカーソルを置く
2. 右クリック →「すべての参照を検索」（またはShift+F12）
3. **確認**: `jump start` / `call start` の一覧がサイドパネルに表示される
4. **確認**: 参照箇所をクリックすると該当行にジャンプする

### B-3. キャラクターの参照一覧（6.5）
1. `script.rpy` 行2の `define s = Character(...)` の `s` にカーソルを置く
2. 右クリック →「すべての参照を検索」（またはShift+F12）
3. **確認**: `s "セリフ"` の一覧が表示される（18件程度）

---

## C. 診断設定（8.5）

### C-1. 診断の設定ON/OFF切り替え
1. テスト用に `script.rpy` の末尾に `    jump nonexistent_test_label` を追加
2. **確認**: 「未定義のラベル」警告が表示される（黄色波線）
3. VSCode設定を開く（Ctrl+,）
4. `renpyCode.diagnostics.undefinedLabel` を検索して `false` に変更
5. **確認**: ラベル警告が消える（他の警告は残る）
6. 設定を `true` に戻す
7. **確認**: 警告が復活する
8. テスト用の行をUndoして戻す

---

## D. 言語機能 — その他（9.1〜9.10）

### D-1. コードフォールディング（9.1）
1. `script.rpy` の `label start:` の行番号左にある折り畳みアイコン（▼）をクリック
2. **確認**: ブロック全体が折り畳まれる（`label start: ...` のように表示）
3. 再度クリックして展開
4. **確認**: 他のlabel定義でも同様に折り畳める

### D-2. カラーピッカー（9.2）
1. `script.rpy` 行2 `define s = Character(_("Sylvie"), color="#c8ffc8")` を確認
2. **確認**: `#c8ffc8` の左にカラースウォッチ（小さな色付き四角）が表示されている
3. カラースウォッチをクリック
4. **確認**: カラーピッカーが開く
5. 色を変更するとコード内の色コードもリアルタイムで変わることを確認
6. Escで閉じてUndoで戻す

### D-3. CodeLens — 参照カウント（9.3）
1. `script.rpy` の各 `label` 定義行の上を確認
2. **確認**: `label start:` の上に「N件の参照」（例: 「1件の参照」）が薄い文字で表示されている
3. **確認**: クリックすると参照一覧が表示される
4. **確認**: 他のラベル（`rightaway`, `book`, `drink`, `later`等）にも表示されている

### D-4. InlayHints — ジャンプ先表示（9.4）
1. `script.rpy` の `jump rightaway`（行45付近）を確認
2. **確認**: 行の右端に ` → game/script.rpy:53` のような薄いグレーテキストが表示されている
3. `jump later` にも同様の表示があることを確認

### D-5. コードアクション — Quick Fix（9.5）
1. `script.rpy` の末尾に `    jump unknown_test_label` と入力
2. 黄色波線が表示されるのを確認
3. 波線の上にカーソルを置くと左に💡（電球）アイコンが表示される
4. 💡をクリック（またはCtrl+.）
5. **確認**: 「Create label 'unknown_test_label'」アクションが表示される
6. 実行すると、ファイル末尾に `label unknown_test_label:\n    pass` が挿入される
7. Undoで全て戻す

### D-6. シグネチャヘルプ（9.6）
1. ファイル先頭付近で `define test = Character(` と入力
2. **確認**: `(` 入力直後にパラメータヒントがポップアップ表示される
3. **確認**: `name` パラメータがハイライトされている
4. `"Test", ` と入力（カンマの後）
5. **確認**: アクティブパラメータが次のパラメータに移動する
6. Undoで戻す

### D-7. ドキュメントリンク（9.7）
1. `script.rpy` の `play music "illurock.opus"` 行（行12付近）を確認
2. **確認**: `"illurock.opus"` が下線付きリンクになっている
3. Ctrl+クリックでファイルが開く（または「リンクを開く」）
4. **確認**: 対応するファイルが開かれる

### D-8. ブラケットハイライト（9.8）
1. `script.rpy` の `if` / `elif` / `else` ブロック（行39付近のメニュー内）にカーソルを置く
2. **確認**: 対応するブロック（if/else）がハイライトされる
3. ※ RenPy Codeがブラケットハイライトを実装していない場合、VSCode標準のインデントガイドのみ表示

### D-9. セマンティックトークン（9.9）
1. Ctrl+Shift+P → `Developer: Inspect Editor Tokens and Scopes` を実行
2. `label start:` の `start` にカーソルを置く
3. **確認**: ポップアップに `semantic token type: function` `semantic token modifiers: declaration` と表示される
4. `define s = ...` の `s` にカーソルを置く
5. **確認**: `semantic token type: variable` `semantic token modifiers: declaration` と表示される
6. `s "Hi there!"` の `s` にカーソルを置く
7. **確認**: `semantic token type: variable` と表示される（modifiersなし）

### D-10. コールヒエラルキー（9.10）
1. `script.rpy` の `label start:` の `start` にカーソルを置く
2. 右クリック →「呼び出し階層を表示」→「着信呼び出しの表示」
3. **確認**: `start` を呼び出しているラベルが階層表示される
4. 「発信呼び出しの表示」に切り替え
5. **確認**: `start` から呼び出されているラベル（`rightaway`, `later`）が表示される

---

## E. シンタックスハイライト（10.1〜10.9）

> テスト用に `game/_test_syntax.rpy` を一時作成して各構文を確認すると効率的。
> テスト後は削除すること。

### テスト用ファイルの内容例:
```renpy
# E-0. テスト用ファイル（テスト後削除）

# コメント行
define e = Character("Eileen", color="#ff0000")
default score = 0

label syntax_test:
    scene bg room
    show eileen happy
    hide eileen

    play music "audio/bgm.ogg"
    stop music
    queue music "audio/bgm2.ogg"
    voice "audio/voice01.ogg"

    e "Hello!"
    "これはナレーションです。"

    $ renpy.pause()

    if score > 10:
        e "High score!"
    elif score > 5:
        e "Not bad."
    else:
        e "Keep trying."

    for i in range(3):
        e "Loop [i]"

    while True:
        e "Infinite"
        jump syntax_test

    menu:
        "Choice A":
            e "You chose A."
        "Choice B":
            e "You chose B."

transform fade_in:
    alpha 0.0
    linear 1.0 alpha 1.0
    ease 0.5 xpos 100

screen test_screen():
    text "Hello"
    textbutton "Click" action Return()

image bg room = "bg/room.png"
```

### E-1. コメントのハイライト（10.1）
- **確認**: `# コメント行` がコメント色（通常: 緑またはグレー）で表示

### E-2. 文字列のハイライト（10.2）
- **確認**: `"Hello!"`, `"audio/bgm.ogg"` 等が文字列色（通常: 茶/橙）で表示

### E-3. label/screen/transform定義（10.3）
- **確認**: `label`, `screen`, `transform` がキーワード色で表示
- **確認**: `syntax_test`, `test_screen`, `fade_in` が名前として別色で表示

### E-4. scene/show/hide コマンド（10.4）
- **確認**: `scene`, `show`, `hide` がキーワード色で表示

### E-5. play/stop/queue/voice コマンド（10.5）
- **確認**: `play`, `stop`, `queue`, `voice` がキーワード色で表示
- **確認**: `music` チャンネル名が適切にハイライト
- **確認**: ファイルパスが文字列色で表示

### E-6. if/elif/else/for/while（10.6）
- **確認**: `if`, `elif`, `else`, `for`, `while` がキーワード色で表示

### E-7. ATLキーワード（10.7）
- **確認**: `transform` ブロック内の `alpha`, `linear`, `ease`, `xpos` がATLキーワードとしてハイライト

### E-8. Python行（10.8）
- **確認**: `$ renpy.pause()` の `$` がキーワード色で表示
- **確認**: `renpy.pause()` がPython風にハイライト（renpy=識別子、pause=メソッド等）

### E-9. セリフ行・ナレーション行（10.9）
- **確認**: `e "Hello!"` の `e` と `"Hello!"` が別色で表示
- **確認**: `"これはナレーションです。"` が文字列色で表示

---

## F. スニペット（11.1〜11.5）

> 各テスト後はUndoで元に戻す

### F-1. label スニペット（11.1）
1. 空行で `label` と入力
2. 補完リストに `label` スニペットが表示されたら選択してTab/Enter
3. **確認**: `label name:` テンプレートが展開される
4. **確認**: `name` 部分が選択状態（すぐに入力可能）
5. Undo

### F-2. menu スニペット（11.2）
1. インデント行で `menu` と入力→補完リストから選択
2. **確認**: `menu:` と選択肢テンプレートが展開される
3. Undo

### F-3. character スニペット（11.3）
1. 行頭で `character` と入力→補完リストから選択
2. **確認**: `define x = Character("Name")` テンプレートが展開される
3. **確認**: タブストップで変数名→表示名の順にカーソルが移動
4. Undo

### F-4. screen スニペット（11.4）
1. 行頭で `screen` と入力→補完リストから選択
2. **確認**: `screen name():` テンプレートが展開される
3. Undo

### F-5. image / transform スニペット（11.5）
1. 行頭で `image` と入力→補完リストから選択
2. **確認**: `image name = "path"` テンプレートが展開される
3. Undo
4. 行頭で `transform` と入力→補完リストから選択
5. **確認**: `transform name:` テンプレートが展開される
6. Undo

---

## G. ゲーム実行（12.3〜12.7）

> 前提: `renpyCode.sdkPath` に正しいRen'Py SDKパスが設定されていること

### G-1. Lint実行（12.3）
1. Ctrl+Shift+P → `RenPy Code: Lint` を実行
2. **確認**: Outputパネルが開き、Lint結果が表示される
3. **確認**: エラーがあれば赤、警告があれば黄色で表示

### G-2. Warp to Line（12.4）
1. `script.rpy` の行60付近（セリフ行）にカーソルを置く
2. Ctrl+Shift+P → `RenPy Code: Warp to Line`
3. **確認**: ゲームが起動し、指定した行のシーンまでワープする

### G-3. Warp to Label（12.5）
1. Ctrl+Shift+P → `RenPy Code: Warp to Label`
2. ラベル一覧が表示されるので `rightaway` を選択
3. **確認**: ゲームが起動し、rightawayラベルのシーンにワープする

### G-4. ゲーム停止（12.6）
1. ゲームが起動中の状態で
2. Ctrl+Shift+P → `RenPy Code: Kill Game`
3. **確認**: ゲームプロセスが終了する

### G-5. SDKパス未設定時のエラー表示（12.7）
1. VSCode設定で `renpyCode.sdkPath` を空文字列に変更
2. Ctrl+Shift+P → `RenPy Code: Launch Game`
3. **確認**: 「SDKパスを設定してください」等のエラーメッセージが表示される
4. 設定を元のパスに戻す

---

## H. ダッシュボード（13.1〜13.4）

### H-1. サイドバーにダッシュボード表示（13.1）
1. アクティビティバー（VSCode左端のアイコン列）でRenPy Codeアイコンを探す
2. クリックしてサイドパネルを開く
3. **確認**: ダッシュボードパネルが表示される

### H-2. プロジェクト統計の表示（13.2）
1. ダッシュボードパネルを確認
2. **確認**: 以下の統計が表示されている
   - ラベル数
   - キャラクター数
   - スクリーン数
   - ファイル数

### H-3. ブリッジ接続ステータスの表示（13.3）
1. ダッシュボードでブリッジセクションを確認
2. **確認**: 接続/未接続の状態が表示されている

### H-4. クイックアクションボタン（13.4）
1. ダッシュボードのアクションボタンを確認
2. 「起動」ボタンをクリック
3. **確認**: ゲームが起動される
4. 「Lint」ボタンがあればクリック
5. **確認**: Lintが実行される

---

## I. i18n / ローカライズ（16.1〜16.2）

### I-1. コマンド名の日本語表示（16.1）
1. VSCodeの表示言語が日本語であることを確認（設定→Display Language）
2. Ctrl+Shift+P でコマンドパレットを開く
3. `RenPy` と入力して検索
4. **確認**: コマンド名が日本語で表示される（例:「ゲームを起動」「Lintを実行」等）

### I-2. エラーメッセージの日本語表示（16.2）
1. VSCodeの表示言語が日本語であることを確認
2. `script.rpy` の末尾に `    jump nonexistent_test_label` と入力
3. **確認**: 警告メッセージが日本語で表示される（「未定義のラベル 'nonexistent_test_label'」）
4. Undoして戻す

---

## J. 設定（17.1〜17.3）

### J-1. sdkPath の反映（17.1）
1. VSCode設定で `renpyCode.sdkPath` に正しいSDKパスを設定
2. Ctrl+Shift+P → `RenPy Code: Launch Game`
3. **確認**: 指定したSDKのRen'Pyでゲームが起動する

### J-2. 診断設定の個別ON/OFF（17.2）
1. テスト用に各種警告が出るコードを用意（_test_new_diagnostics.rpy を参照）
2. 以下の設定を一つずつfalseにして、対応する警告のみ消えることを確認:
   - `renpyCode.diagnostics.undefinedLabel` — 未定義ラベル
   - `renpyCode.diagnostics.undefinedCharacter` — 未定義キャラクター
   - `renpyCode.diagnostics.mixedIndentation` — インデント混在
   - `renpyCode.diagnostics.unusedLabel` — 未使用ラベル
   - `renpyCode.diagnostics.missingResource` — 欠落リソース
   - `renpyCode.diagnostics.missingImage` — 欠落画像
   - `renpyCode.diagnostics.unreachableCode` — 到達不能コード
3. **確認**: 各設定を `false` にすると対応する警告のみ消え、他は残る
4. 全設定を `true` に戻す

### J-3. 設定変更後のリアルタイム反映（17.3）
1. `renpyCode.diagnostics.undefinedLabel` を `false` に変更
2. リロードせずに `.rpy` ファイルを編集（1文字追加→削除等）
3. **確認**: 未定義ラベル警告が消えている（リロード不要）
4. 設定を `true` に戻す
5. 再度ファイルを編集
6. **確認**: 警告が復活する

---

## K. PRO機能（14.5〜14.6, 15.1〜15.11）

> 前提: ライセンスキーが必要。未購入の場合は N/A とする。

### K-1. ライセンス認証（15.1）
1. Ctrl+Shift+P → `RenPy Code: Activate License`
2. ライセンスキーを入力
3. **確認**: 認証成功メッセージが表示される
4. **確認**: PRO機能が有効化される

### K-2. フローグラフ表示（14.5）
1. Ctrl+Shift+P → `RenPy Code: Show Flow Graph`
2. **確認**: WebViewパネルが開き、Mermaidベースのフローグラフが表示される
3. **確認**: ノードにラベル名（start, rightaway, book, drink, later等）
4. **確認**: エッジにjump/call関係が表示

### K-3. フローグラフのノードクリック（14.6）
1. フローグラフのノード（例: `rightaway`）をクリック
2. **確認**: エディタが `label rightaway:` の定義行にジャンプする

### K-4. デバッガー（15.2）
1. `script.rpy` の任意の行にブレークポイントを設置（行番号左をクリック）
2. F5でデバッグ開始
3. **確認**: ブレークポイントで実行が停止する
4. **確認**: 変数パネルにゲーム変数が表示される

### K-5. ライブプレビュー（15.3）
1. Ctrl+Shift+P → `RenPy Code: Show Preview`
2. **確認**: 現在シーンのスクリーンショットプレビューが表示される

### K-6. 変数トラッカー（15.4）
1. サイドバーの変数ビューを開く
2. ゲーム実行中にリフレッシュ
3. **確認**: ゲーム変数（`book` 等）の値が表示される

### K-7. ヒートマップ（15.5）
1. Ctrl+Shift+P → `RenPy Code: Show Heatmap`
2. **確認**: プレイテスト訪問頻度のヒートマップが表示される

### K-8. アセットマネージャー（15.6）
1. Ctrl+Shift+P → `RenPy Code: Show Assets`
2. **確認**: 画像・音声ファイルの一覧が表示される
3. **確認**: 未使用アセットが検出・表示される

### K-9. 翻訳ダッシュボード（15.7）
1. Ctrl+Shift+P → `RenPy Code: Show Translation`
2. **確認**: 翻訳完了率が表示される
3. **確認**: 未翻訳文字列の一覧が表示される

### K-10. テストランナー（15.8）
1. Ctrl+Shift+P → `RenPy Code: Run All Tests`
2. **確認**: testcase定義が検出される
3. **確認**: 実行結果が表示される

### K-11. リファクタリング — リネーム（15.9）
1. `label rightaway:` の `rightaway` にカーソルを置く
2. F2（またはCtrl+Shift+P → `Rename Symbol`）
3. `rightaway2` と入力してEnter
4. **確認**: `label rightaway:` → `label rightaway2:` に変更
5. **確認**: `jump rightaway` → `jump rightaway2` も自動変更
6. Undoで全て戻す

### K-12. ルート抽出（15.10）
1. `script.rpy` のセリフ数行を選択
2. Ctrl+Shift+P → `RenPy Code: Extract Route`
3. **確認**: 選択範囲が新しいラベルに抽出される
4. Undoで戻す

### K-13. パフォーマンスプロファイラ（15.11）
1. Ctrl+Shift+P → `RenPy Code: Profile Project Performance`
2. **確認**: Outputパネルに「RenPy Code Profiler」タブが作成される
3. **確認**: 複雑度レポート、リソースレポート、警告レポートが表示される

---

## チェックリスト

| # | 項目 | 結果 | 備考 |
|---|------|------|------|
| A-1 | jump後のラベル補完 | ⬜ | |
| A-2 | call後のラベル補完 | ⬜ | |
| A-3 | キャラクターセリフ補完 | ⬜ | |
| A-4 | スクリーン名補完 | ⬜ | |
| A-5 | ステートメント補完 | ⬜ | |
| A-5b | ATLキーワード補完 | ⬜ | |
| A-6 | 組み込みクラス補完 | ⬜ | |
| A-7 | スクリーンキーワード補完 | ⬜ | |
| B-1 | スクリーン定義ジャンプ | ⬜ | |
| B-2 | ラベル参照一覧 | ⬜ | |
| B-3 | キャラクター参照一覧 | ⬜ | |
| C-1 | 診断ON/OFF切り替え | ⬜ | |
| D-1 | コードフォールディング | ⬜ | |
| D-2 | カラーピッカー | ⬜ | |
| D-3 | CodeLens | ⬜ | |
| D-4 | InlayHints | ⬜ | |
| D-5 | Quick Fix | ⬜ | |
| D-6 | シグネチャヘルプ | ⬜ | |
| D-7 | ドキュメントリンク | ⬜ | |
| D-8 | ブラケットハイライト | ⬜ | |
| D-9 | セマンティックトークン | ⬜ | |
| D-10 | コールヒエラルキー | ⬜ | |
| E-1〜E-9 | シンタックスハイライト（9項目） | ⬜ | |
| F-1 | labelスニペット | ⬜ | |
| F-2 | menuスニペット | ⬜ | |
| F-3 | characterスニペット | ⬜ | |
| F-4 | screenスニペット | ⬜ | |
| F-5 | image/transformスニペット | ⬜ | |
| G-1 | Lint実行 | ⬜ | |
| G-2 | Warp to Line | ⬜ | |
| G-3 | Warp to Label | ⬜ | |
| G-4 | ゲーム停止 | ⬜ | |
| G-5 | SDKパス未設定エラー | ⬜ | |
| H-1 | ダッシュボード表示 | ⬜ | |
| H-2 | プロジェクト統計 | ⬜ | |
| H-3 | ブリッジステータス | ⬜ | |
| H-4 | クイックアクション | ⬜ | |
| I-1 | コマンド名日本語 | ⬜ | |
| I-2 | エラーメッセージ日本語 | ⬜ | |
| J-1 | sdkPath反映 | ⬜ | |
| J-2 | 診断個別ON/OFF | ⬜ | |
| J-3 | 設定リアルタイム反映 | ⬜ | |
| K-1〜K-13 | PRO機能（13項目） | ⬜ | ライセンス要 |
