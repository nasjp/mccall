アプリ名: McCall

ルーティンで最強の男イコライザーのロバートマッコールから命名

# 1. 目的と成功条件

## 目的

* ラベル付きの複数ステップ・タイムラインを、指定分数で**自動進行・反復**できる
* noteステップはアプリ内でメモを扱わない（保存もしない、外部を開かない）
* noteステップでは**確認ダイアログ**で「メモした/しない」を明示させる
* ステップ切替時の**サウンドを、ステップ単位で鳴らす/鳴らさないを設定**できる（デフォルトは「鳴る」寄りで良い）

## 成功条件

* 1セッションが **Start → 自動遷移 → Repeat** で回る（迷いゼロ）
* noteステップでユーザーが毎回「メモした/スキップ」を**意思決定**する（無意識で流れない）
* 1日の回数・総作業時間・スキップ率が見える（自己欺瞞できない）
* サウンドが「欲しい人には気持ちよく鳴り、不要な場面では即ミュートできる」ため、**継続利用の阻害要因にならない**

---

# 2. 対象ユーザーと前提

* Macで仕事中に回す（IDE/ブラウザ/会議など割り込みあり）
* キーボード主体で操作したい
* メモは既存の場所（Notion/Obsidian/紙）でやる。アプリは関与しない
* 8〜12ステップ程度の細かいルーチンを回したい
* サウンドで切替に気づきたい（ただし会議/夜間などでは即オフにしたい）

---

# 3. コアコンセプト（データモデル）

## Routine（ルーチン）

* id
* name
* steps: Step[]
* repeatMode: `infinite | count(n) | duration(totalSeconds)`
* autoAdvance: boolean（ステップ終了で次へ）
* notifications: boolean（ステップ切替通知）
* soundDefault: `on | off`（ルーチン全体のデフォルト）
  * 例: デフォルトは `on`（鳴ってほしい派を最短で満たす）
* soundScheme: `default | endDifferent`（音の種類は増やさない。増やすほど沼る）

## Step（ステップ）

* id
* order
* label（表示名）
* durationSeconds
* instruction（1〜2行）
* kind: `work | break | transition | note`
* soundOverride: `inherit | on | off`
  * `inherit` が基本（ルーチンの soundDefault に従う）
  * `off` にしたいステップだけ例外指定できる（UIが肥大化しない）
* acknowledgement（確認仕様）
  * enabled: boolean（noteだけtrueが基本）
  * promptTitle / promptBody（例：「メモした？」）
  * requiredToProceed: boolean（**ここが重要：確認するまで次へ進めない**）
  * options: `done | skip`（最低これだけ）
  * allowSkip: boolean（trueでも良いが、ログで可視化）

## Session（実行ログ）

* id
* routineId
* startedAt / endedAt
* stepRuns: StepRun[]
* totals: workSeconds / breakSeconds / cyclesCount
* mutedDuringSession: boolean（セッション中にミュートだったか。詳細ログは要らない）

## StepRun（実績）

* stepId
* plannedDurationSeconds
* actualDurationSeconds
* startedAt / endedAt
* result: `completed | skipped | aborted`
* acknowledgementResult（note等）
  * respondedAt
  * choice: `done | skip`（or null）
  * responseTimeMs（確認に何秒かかったか）
* soundPlayed: boolean（その切替で音を鳴らしたか。トラブルシュート用に最小で残す）

---

# 4. 主要ユーザーフロー

## A) ルーチンを回す

1. メニューバー or ショートカットで Start
2. ステップ表示（名前/残り/指示）
3. 終了 → 通知 → 自動で次ステップ
4. ステップ切替時、**有効設定ならサウンド再生**
   * 有効判定：`effectiveSound = (Step.soundOverride != inherit ? Step.soundOverride : Routine.soundDefault)`
5. **noteステップ終了時**に確認ダイアログ表示
   * `メモした？ [Done] [Skip]`
   * **requiredToProceed=true なら、選択するまで遷移しない**
6. 次ステップへ、repeat条件まで繰り返す

## B) ルーチンを作る/編集する

* ステップ追加/削除/並べ替え
* 時間・表示名・指示文・note確認の有無を設定
* 各ステップのサウンド：`inherit/on/off`
* ルーチン全体のサウンドデフォルト：`on/off`
* テンプレ複製（10分スプリント）

## C) 振り返る

* 今日/週の回数、総作業時間、総休憩時間
* noteの `skip率`（メモ工程の崩壊を可視化）
* どのステップで止まりがちか
* ミュート率（会議続きで音が邪魔になってないかの判断材料）

---

# 5. 機能要件（Must / Should / Could）

## Must（MVP）

* ルーチン（複数ステップ、順序、時間、ラベル、指示文）
* タイマー実行（Start / Pause / Resume / Skip / Stop）
* 自動遷移（ステップ終了で次へ）
* 通知（ステップ切替）
* **確認ダイアログ（note用）**
  * Done/Skip の2択
  * **選ぶまで進めないモード**（requiredToProceed）
* セッションログ保存（時間、回数、各ステップ結果、noteのDone/Skip）
* **サウンド**
  * ルーチン全体 `soundDefault(on/off)`
  * ステップごと `soundOverride(inherit/on/off)`
  * サウンド再生（ステップ切替時）
  * グローバル一時ミュート（今すぐ切れることが継続利用の条件）
    * 例: メニューバーからワンクリック / ショートカット

## Should（v1）

* メニューバー常駐（残り時間＋ステップ名）
* グローバルショートカット（Start/Pause/Skip）
* 確認ダイアログの操作を完全キーボード化（Enter=Done、S=Skip など）
* 「前面に出す」オプション（確認を見逃さない）
* 週次サマリ（回数/総時間/skip率）
* サウンドのUX強化（ただし設定を増やしすぎない）
  * 例: 「セッション終了だけ別音」(soundScheme = endDifferent)
  * 例: 「次の1サイクルだけミュート」

## Could（後回し）

* ルーチンの条件分岐
* 高度な統計グラフ
* 同期
* （将来）外部連携アクション
  ※現方針では不要。ここに手を出すと別アプリになる。
* Quiet Hours（時間帯で強制ミュート）
  ※便利だが、まずは“一発ミュート”が勝ち筋。

---

# 6. UI要件（迷いを消す）

* 実行中は常にこれだけ：
  * ステップ名
  * 残り時間
  * 指示文（1〜2行）
* 操作は最小：
  * Pause / Skip / Stop
* note確認ダイアログは極小：
  * 文言1行（「メモした？」）
  * ボタン2つ（Done / Skip）
  * キーボードショートカット表示
* サウンド制御は“迷いなく切れる”ことが最優先：
  * メニューバーに「🔈/🔇」の状態が出る（視認できる）
  * 1クリック or 1ショートカットで切替（設定画面を開かせない）
* UIスタイルは過度に主張しない（道具として背景になる）
  * macOSネイティブ寄せ（セマンティックカラー、SFフォント、余白固定）
  * タイマー数字はmonospace digit（表示のブレを消す）
  * アニメは最小（フェード程度）

---

# 7. 非機能要件（ここを舐めると使われない）

* スリープ/復帰で壊れない（monotonic clockベース）
* 常駐で軽い（CPU/メモリ）
* ローカル保存、外部送信なし
* 通知権限が無くても、UI側で遷移が分かる
* ダイアログが出ない/隠れる事故を防ぐ（前面表示オプション、メニューバー点滅など）
* サウンドが鳴らない環境でも成立する（ミュート/BT切断/集中モード）
  * 音は補助。視覚で成立が必須。

---

# 8. エッジケース要件

* note確認が出たまま放置された場合
  * requiredToProceed=true なら停止状態として扱う（ログに「待機」でもいい）
* 会議中などでSkip連打が起こる
  * skip率で可視化（罰ではなく事実として出す）
* 途中でStopしたセッションは aborted として残す
* ルーチン編集は実行中に反映しない（次回から）
* サウンド関連
  * 通知/音が抑制される状態（集中モード等）でも、メニューバー表示で気づける
  * ルーチン soundDefault=on でも、特定ステップだけ off にできる（逆も同様）
  * ミュートON中は、ステップのon設定より優先（全体ミュートが最上位）

---

# 9. 初期テンプレ（あなたの10分ミニ・スプリント）

8ステップ（合計10分）

1. 0:00–0:20 タスク1行
2. 0:20–0:40 完了条件
3. 0:40–1:00 環境整備
4. 1:00–5:00 集中
5. 5:00–5:10 停止
6. 5:10–7:00 note（確認ダイアログあり）
7. 7:00–8:30 回復
8. 8:30–10:00 次の着火準備

noteステップの確認仕様：

* prompt：「メモした？」
* options：Done / Skip
* requiredToProceed：true（推奨）

サウンド初期設定（推奨）：

* Routine.soundDefault = on（あなたの好みに合わせる）
* Step.soundOverride = inherit（全ステップ）
  * うるさく感じたステップだけ off にする運用にする（設定が増えない）

---

# 10. 受け入れ条件（テスト観点）

* ルーチン作成→保存→再起動後も残る
* タイマーが全ステップで指定秒数通りに自動遷移する
* noteステップ終了時に確認が出て、**選ぶまで次へ進まない**（設定通り）
* Done/Skip がログに残り、日次集計で skip率が見える
* スリープ復帰後も残り時間/遷移が破綻しない
* メニューバー表示が実行状態と同期している
* サウンド受け入れ条件
  * Routine.soundDefault=on でステップ切替時に音が鳴る
  * 特定ステップで soundOverride=off にすると、そのステップ切替だけ鳴らない
  * 特定ステップで soundOverride=on（Routineがoffでも）にすると、そのステップ切替は鳴る
  * グローバルミュートON中は、上記設定に関係なく一切鳴らない
  * 音が鳴らない環境でも、視覚（通知/メニューバー/前面表示）で運用が破綻しない
