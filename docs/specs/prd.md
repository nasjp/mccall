アプリ名: McCall

ルーティンで最強の男イコライザーのロバートマッコールから命名

# 1. 目的と成功条件

## 目的

* ラベル付きの複数ステップ・タイムラインを、指定分数で**自動進行・反復**できる
* アプリ内でメモ本文は扱わない（保存しない・外部を開かない）
* 「メモ用ステップ（例：note）」は**特別扱いしない**  
  → 通常のステップとして「ラベル/指示文」で表現する
* 各ステップごとに、終了時の**確認（Check-in）**を設定できる  
  * Off（表示しない）
  * Prompt（非強制：進行は止めず、一定時間だけ促す）
  * Gate（強制：選択するまで次に進まない）
* ステップ切替時の**サウンドを、ステップ単位で鳴らす/鳴らさないを設定**できる（デフォルトは「鳴る」寄りでも良い）

## 成功条件

* 1セッションが **Start → 自動遷移 → Repeat** で回る（迷いゼロ）
* Check-in を有効にしたステップでは、ユーザーが毎回「Done/Skip」を**意思決定**する（無意識で流れない）
* 1日の回数・総作業時間・Check-in の skip率が見える（自己欺瞞できない）
* サウンドが「欲しい人には気持ちよく鳴り、不要な場面では即ミュートできる」ため、継続利用の阻害要因にならない

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
* soundScheme: `default | endDifferent`（音の種類は増やさない。増やすほど沼る）

## Step（ステップ）

* id
* order
* label（表示名）
* durationSeconds
* instruction（1〜2行）
* soundOverride: `inherit | on | off`
  * `inherit` が基本（ルーチンの soundDefault に従う）
* stats
  * countAsBreak: boolean（休憩として集計するか）
    * kind(enum)は廃止。集計用途の最小ビットだけ残す。
* checkIn（ステップ終了時の確認）
  * mode: `off | prompt | gate`
  * promptTitle / promptBody（例：「メモした？」）
  * promptTimeoutSeconds: number（mode=prompt の時だけ。例：15秒）
  * options: `done | skip`（固定。ラベル変更はv2以降）

## Session（実行ログ）

* id
* routineId
* startedAt / endedAt
* stepRuns: StepRun[]
* totals
  * totalSeconds
  * workSeconds（countAsBreak=false の合計）
  * breakSeconds（countAsBreak=true の合計）
  * cyclesCount
  * checkInDoneCount
  * checkInSkipCount
* mutedDuringSession: boolean（セッション中にミュートだったか。詳細ログは要らない）

## StepRun（実績）

* stepId
* plannedDurationSeconds
* actualDurationSeconds
* startedAt / endedAt
* result: `completed | skipped | aborted`
* checkInResult（checkInがoff以外の時）
  * mode: `prompt | gate`
  * respondedAt（未反応でタイムアウト/無視なら null）
  * choice: `done | skip | null`
  * responseTimeMs
  * timedOut: boolean（promptで未反応→true）
* soundPlayed: boolean（その切替で音を鳴らしたか。トラブルシュート用）

---

# 4. 主要ユーザーフロー

## A) ルーチンを回す

1. メニューバー or ショートカットで Start
2. ステップ表示（名前/残り/指示）
3. 終了 → 通知 → 自動で次ステップ
4. ステップ切替時、**有効設定ならサウンド再生**
   * 有効判定：`effectiveSound = (Step.soundOverride != inherit ? Step.soundOverride : Routine.soundDefault)`
   * ただし globalMute が最優先でサウンド無効
5. ステップ終了時に checkIn が有効なら分岐
   * mode=gate：モーダル表示 → `Done/Skip` を選ぶまで遷移を止める
   * mode=prompt：遷移は止めず、タイマーUIに非モーダルの確認（バー/トースト）を一定秒表示  
     - 期限内に `Done/Skip` を押せば記録  
     - 未反応なら timedOut=true として skip扱い（choice=null）
6. 次ステップへ、repeat条件まで繰り返す

## B) ルーチンを作る/編集する

* ステップ追加/削除/並べ替え
* 時間・表示名・指示文を設定
* ステップごとの設定
  * サウンド：`inherit/on/off`
  * 集計：`休憩として集計（countAsBreak）` のON/OFF
  * checkIn：`off/prompt/gate` と文言（title/body）、promptのタイムアウト秒
* テンプレ複製（10分スプリント）

## C) 振り返る

* 今日/週の回数、総作業時間（workSeconds）、休憩時間（breakSeconds）
* checkIn の `skip率`（checkInSkipCount / (done+skip)）
* どのステップで止まりがちか
* ミュート率（音が邪魔になってないかの判断材料）

---

# 5. 機能要件（Must / Should / Could）

## Must（MVP）

* ルーチン（複数ステップ、順序、時間、ラベル、指示文）
* タイマー実行（Start / Pause / Resume / Skip / Stop）
* 自動遷移（ステップ終了で次へ）
* 通知（ステップ切替）
* **checkIn（ステップごと）**
  * off/prompt/gate の3モード
  * Done/Skip の2択（promptは非強制、gateは強制）
  * promptはタイムアウトで記録される（timedOut）
* セッションログ保存（時間、回数、各ステップ結果、checkIn結果）
* **サウンド**
  * ルーチン全体 `soundDefault(on/off)`
  * ステップごと `soundOverride(inherit/on/off)`
  * グローバル一時ミュート（今すぐ切れることが継続利用の条件）
* **集計**
  * ステップ単位 `countAsBreak` に基づき work/break を計算

## Should（v1）

* メニューバー常駐（残り時間＋ステップ名）
* グローバルショートカット（Start/Pause/Skip/Mute）
* 「前面に出す」オプション（gateの見逃し防止）
* 週次サマリ（回数/総時間/skip率）
* checkIn文言のテンプレ（例：「メモした？」「タスク決めた？」など）

## Could（後回し）

* ルーチンの条件分岐
* 高度な統計グラフ
* 同期
* Quiet Hours（時間帯で強制ミュート）
* checkInのボタン文言カスタム（Done/Skipのラベル変更）

---

# 6. UI要件（迷いを消す）

* 実行中は常にこれだけ：
  * ステップ名
  * 残り時間
  * 指示文（1〜2行）
* 操作は最小：
  * Pause / Skip / Stop（未実行時はStart）
* checkIn UI
  * mode=gate：標準モーダル（Done/Skip、キーボード操作）
  * mode=prompt：非モーダル（バー/トースト）、一定秒で消える
* サウンド制御は“迷いなく切れる”ことが最優先：
  * メニューバーに「🔈/🔇」の状態が出る
  * 1クリック or 1ショートカットで切替
* ルーチン編集のステップ詳細に、次の3つが並ぶだけで良い：
  1) サウンド（inherit/on/off）
  2) 休憩として集計（ON/OFF）
  3) checkIn（off/prompt/gate + 文言 + タイムアウト）

---

# 7. 非機能要件（ここを舐めると使われない）

* スリープ/復帰で壊れない（monotonic clockベース）
* 常駐で軽い（CPU/メモリ）
* ローカル保存、外部送信なし
* 通知権限が無くても、UI側で遷移が分かる
* gateが出ない/隠れる事故を防ぐ（前面表示オプション、メニューバー点滅など）
* サウンドが鳴らない環境でも成立する（ミュート/BT切断/集中モード）

---

# 8. エッジケース要件

* gateのcheckInが出たまま放置された場合
  * 進行停止（ログ上は「awaiting checkIn」扱いでも良い）
* promptのcheckInを無視した場合
  * timeout後、timedOut=true で記録（skip扱い）
* 会議中などでSkip連打が起こる
  * skip率で可視化（罰ではなく事実として出す）
* 途中でStopしたセッションは aborted として残す
* ルーチン編集は実行中に反映しない（次回から）
* globalMuteが最上位（ステップ/ルーチン設定より優先）

---

# 9. 初期テンプレ（あなたの10分ミニ・スプリント）

8ステップ（合計10分）

1. 0:00–0:20 タスク1行
2. 0:20–0:40 完了条件
3. 0:40–1:00 環境整備
4. 1:00–5:00 集中
5. 5:00–5:10 停止
6. 5:10–7:00 メモ（指示：障害/次の1手/気づき）
7. 7:00–8:30 回復
8. 8:30–10:00 次の着火準備

テンプレの推奨設定

* checkIn
  * ステップ6（メモ）：mode=gate、title「メモした？」、bodyは無し、timeout不要
  * 他ステップ：mode=off
* 集計（countAsBreak）
  * ステップ7（回復）：true
  * それ以外：false（必要なら後で調整）
* サウンド
  * Routine.soundDefault = on（好みに合わせる）
  * Step.soundOverride = inherit（全ステップ）

---

# 10. 受け入れ条件（テスト観点）

* ルーチン作成→保存→再起動後も残る
* タイマーが全ステップで指定秒数通りに自動遷移する
* checkInがステップごとに期待通り動作する
  * off：何も出ない
  * gate：Done/Skipを選ぶまで次に進まない
  * prompt：次へ進みつつ、一定秒の確認UIが出て、未反応ならtimedOutで記録される
* checkIn の Done/Skip/timedOut がログに残り、日次集計で skip率が見える
* countAsBreak のON/OFFで workSeconds/breakSeconds が変わる
* スリープ復帰後も残り時間/遷移が破綻しない
* メニューバー表示が実行状態と同期している
* サウンド受け入れ条件
  * Routine.soundDefault=on でステップ切替時に音が鳴る
  * 特定ステップで soundOverride=off にすると、その切替は鳴らない
  * globalMute ON中は、設定に関係なく一切鳴らない
  * 音が鳴らない環境でも、視覚（通知/メニューバー/前面表示）で運用が破綻しない
