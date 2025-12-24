# デザイン文書

## 概要

McCallは、Tauri + React + TypeScriptで構築されるmacOS向けタイマーアプリケーションです。ルーチンベースの作業管理を提供し、各ステップでのCheck-in機能とサウンド制御を特徴とします。

アプリケーションは以下の主要コンポーネントで構成されます：
- フロントエンド：React + TypeScript（UI層）
- バックエンド：Rust（Tauri、データ管理・システム統合）
- ストレージ：ローカルファイルシステム（JSON形式）
- システム統合：macOSメニューバー、通知、グローバルショートカット

## アーキテクチャ

### システム構成

```
┌─────────────────────────────────────────────────────────────┐
│                    macOS System                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Menu Bar    │  │ Notifications│  │ Global Shortcuts    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Tauri App                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                React Frontend                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ Timer View  │  │ Routine     │  │ Stats View  │ │   │
│  │  │             │  │ Editor      │  │             │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │            State Management                     │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                Rust Backend                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ Timer       │  │ Audio       │  │ System      │ │   │
│  │  │ Engine      │  │ Manager     │  │ Integration │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │            Data Layer                           │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                Local File System                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ routines.json│  │sessions.json│  │ settings.json       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### データフロー

1. **ユーザー操作** → React UI → Tauri Commands → Rust Backend
2. **タイマー更新** → Rust Timer Engine → Tauri Events → React State Update
3. **データ永続化** → Rust Data Layer → Local JSON Files
4. **システム通知** → Rust System Integration → macOS APIs

## コンポーネントとインターフェース

### フロントエンド（React）コンポーネント

#### 1. App Component
- **責任**: アプリケーション全体の状態管理とルーティング
- **状態**: 現在のビュー、グローバル設定、タイマー状態
- **子コンポーネント**: TimerView, RoutineEditor, StatsView

#### 2. TimerView Component
- **責任**: タイマー実行画面の表示と操作
- **表示要素**: 
  - StepBadge（現在のステップ名）
  - TimerDisplay（残り時間、monospaced digits）
  - InstructionText（指示文）
  - ControlButtons（Pause/Skip/Stop）
- **状態**: 現在のステップ、残り時間、実行状態

#### 3. CheckInDialog Component
- **責任**: Check-in確認ダイアログの表示
- **モード**: 
  - Gate: モーダルダイアログ（Done/Skip選択必須）
  - Prompt: 非モーダル通知（タイムアウト付き）
- **キーボード**: Enter（Done）、S（Skip）

#### 4. RoutineEditor Component
- **責任**: ルーチンの作成・編集
- **機能**: 
  - ステップの追加・削除・並び替え
  - ステップ詳細設定（時間、ラベル、指示、サウンド、Check-in）
  - ルーチン全体設定（リピート、サウンドデフォルト）

#### 5. StatsView Component
- **責任**: 統計情報の表示
- **表示項目**: 
  - 今日/週の実行回数
  - 作業時間・休憩時間
  - Check-in skip率
  - ミュート使用率

#### 6. MenuBarPopover Component
- **責任**: メニューバーからの操作UI
- **機能**: Start/Pause/Skip/Stop、ミュート切替
- **表示**: 現在状態、残り時間、ステップ名（短縮）

### バックエンド（Rust）モジュール

#### 1. Timer Engine
```rust
pub struct TimerEngine {
    current_session: Option<Session>,
    current_step_index: usize,
    step_start_time: Instant,
    is_paused: bool,
    pause_duration: Duration,
}

impl TimerEngine {
    pub fn start_routine(&mut self, routine: &Routine) -> Result<()>;
    pub fn pause(&mut self) -> Result<()>;
    pub fn resume(&mut self) -> Result<()>;
    pub fn skip_step(&mut self) -> Result<()>;
    pub fn stop(&mut self) -> Result<()>;
    pub fn get_remaining_time(&self) -> Duration;
    pub fn handle_check_in_response(&mut self, response: CheckInResponse) -> Result<()>;
}
```

#### 2. Audio Manager
```rust
pub struct AudioManager {
    global_mute: bool,
    sound_scheme: SoundScheme,
}

impl AudioManager {
    pub fn play_step_transition(&self, step: &Step, routine: &Routine) -> Result<()>;
    pub fn set_global_mute(&mut self, muted: bool);
    pub fn should_play_sound(&self, step: &Step, routine: &Routine) -> bool;
}
```

#### 3. System Integration
```rust
pub struct SystemIntegration {
    menu_bar: MenuBarManager,
    notifications: NotificationManager,
    shortcuts: ShortcutManager,
}

impl SystemIntegration {
    pub fn update_menu_bar(&self, state: &TimerState) -> Result<()>;
    pub fn show_notification(&self, message: &str) -> Result<()>;
    pub fn register_global_shortcuts(&self) -> Result<()>;
    pub fn show_check_in_dialog(&self, check_in: &CheckIn) -> Result<()>;
}
```

#### 4. Data Layer
```rust
pub struct DataManager {
    routines_path: PathBuf,
    sessions_path: PathBuf,
    settings_path: PathBuf,
}

impl DataManager {
    pub fn save_routine(&self, routine: &Routine) -> Result<()>;
    pub fn load_routines(&self) -> Result<Vec<Routine>>;
    pub fn save_session(&self, session: &Session) -> Result<()>;
    pub fn load_sessions(&self, from: DateTime, to: DateTime) -> Result<Vec<Session>>;
    pub fn save_settings(&self, settings: &Settings) -> Result<()>;
    pub fn load_settings(&self) -> Result<Settings>;
}
```

### Tauri Commands

```rust
#[tauri::command]
async fn start_routine(routine_id: String) -> Result<(), String>;

#[tauri::command]
async fn pause_timer() -> Result<(), String>;

#[tauri::command]
async fn resume_timer() -> Result<(), String>;

#[tauri::command]
async fn skip_step() -> Result<(), String>;

#[tauri::command]
async fn stop_timer() -> Result<(), String>;

#[tauri::command]
async fn get_timer_state() -> Result<TimerState, String>;

#[tauri::command]
async fn save_routine(routine: Routine) -> Result<(), String>;

#[tauri::command]
async fn load_routines() -> Result<Vec<Routine>, String>;

#[tauri::command]
async fn respond_to_check_in(response: CheckInResponse) -> Result<(), String>;

#[tauri::command]
async fn toggle_global_mute() -> Result<bool, String>;

#[tauri::command]
async fn get_session_stats(from: String, to: String) -> Result<SessionStats, String>;
```

### Tauri Events

```rust
// フロントエンドに送信されるイベント
"timer-tick" -> { remaining_seconds: u32, step_name: String }
"step-changed" -> { step: Step, step_index: usize }
"session-completed" -> { session: Session }
"check-in-required" -> { check_in: CheckIn, step: Step }
"check-in-timeout" -> { step_id: String }
"timer-paused" -> {}
"timer-resumed" -> {}
"timer-stopped" -> {}
```

## データモデル

### Core Types

```typescript
interface Routine {
  id: string;
  name: string;
  steps: Step[];
  repeatMode: RepeatMode;
  autoAdvance: boolean;
  notifications: boolean;
  soundDefault: SoundSetting;
  soundScheme: SoundScheme;
}

interface Step {
  id: string;
  order: number;
  label: string;
  durationSeconds: number;
  instruction: string;
  soundOverride: SoundOverride;
  countAsBreak: boolean;
  checkIn: CheckInConfig;
}

interface CheckInConfig {
  mode: 'off' | 'prompt' | 'gate';
  promptTitle?: string;
  promptBody?: string;
  promptTimeoutSeconds?: number;
}

interface Session {
  id: string;
  routineId: string;
  startedAt: string;
  endedAt?: string;
  stepRuns: StepRun[];
  totals: SessionTotals;
  mutedDuringSession: boolean;
}

interface StepRun {
  stepId: string;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  startedAt: string;
  endedAt?: string;
  result: 'completed' | 'skipped' | 'aborted';
  checkInResult?: CheckInResult;
  soundPlayed: boolean;
}

interface CheckInResult {
  mode: 'prompt' | 'gate';
  respondedAt?: string;
  choice: 'done' | 'skip' | null;
  responseTimeMs?: number;
  timedOut: boolean;
}

type RepeatMode = 
  | { type: 'infinite' }
  | { type: 'count', value: number }
  | { type: 'duration', totalSeconds: number };

type SoundSetting = 'on' | 'off';
type SoundOverride = 'inherit' | 'on' | 'off';
type SoundScheme = 'default' | 'endDifferent';
```

### State Management

React側では以下の状態管理パターンを使用：

```typescript
interface AppState {
  currentView: 'timer' | 'editor' | 'stats';
  timerState: TimerState;
  routines: Routine[];
  currentRoutine?: Routine;
  globalMute: boolean;
  settings: AppSettings;
}

interface TimerState {
  isRunning: boolean;
  isPaused: boolean;
  currentSession?: Session;
  currentStepIndex: number;
  remainingSeconds: number;
  awaitingCheckIn?: CheckInConfig;
}
```

## エラーハンドリング

### エラー分類

1. **システムエラー**: ファイルI/O、権限、システムAPI呼び出し失敗
2. **データエラー**: 不正なJSON、データ整合性違反
3. **タイマーエラー**: 不正な状態遷移、時間計算エラー
4. **ユーザーエラー**: 不正な入力、操作順序違反

### エラー処理戦略

```rust
#[derive(Debug, thiserror::Error)]
pub enum McCallError {
    #[error("Timer not running")]
    TimerNotRunning,
    
    #[error("Invalid routine: {0}")]
    InvalidRoutine(String),
    
    #[error("File system error: {0}")]
    FileSystem(#[from] std::io::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("System integration error: {0}")]
    SystemIntegration(String),
}
```

### 復旧戦略

- **データ破損**: バックアップファイルからの復元、デフォルト設定での初期化
- **タイマー状態不整合**: 安全な状態（停止）への強制遷移
- **システム権限不足**: 機能の優雅な劣化（通知なしでの動作継続）

## テスト戦略

### 単体テスト

1. **Timer Engine**: 時間計算、状態遷移、Check-in処理
2. **Audio Manager**: サウンド再生判定ロジック
3. **Data Layer**: シリアライゼーション、ファイルI/O
4. **React Components**: レンダリング、イベントハンドリング

### 統合テスト

1. **タイマー実行フロー**: 開始→進行→Check-in→完了
2. **データ永続化**: 保存→読み込み→整合性確認
3. **システム統合**: メニューバー更新、通知表示、ショートカット

### E2Eテスト

1. **基本ワークフロー**: ルーチン作成→実行→統計確認
2. **Check-in機能**: Gate/Promptモードでの動作確認
3. **サウンド制御**: グローバル/個別ミュート動作
4. **システム復旧**: スリープ/復帰、アプリ再起動

### テスト環境

- **Rust**: `cargo test`でのユニット・統合テスト
- **React**: Jest + React Testing Libraryでのコンポーネントテスト
- **E2E**: Tauriの`tauri-driver`を使用したWebDriverテスト

## パフォーマンス考慮事項

### メモリ使用量

- セッションデータの定期的なクリーンアップ（古いデータのアーカイブ）
- 大量のステップを持つルーチンでの効率的な状態管理
- React re-renderの最適化（useMemo, useCallback活用）

### CPU使用量

- タイマー更新頻度の最適化（1秒間隔、必要時のみ更新）
- バックグラウンドでの軽量な動作（常駐時のCPU使用率 < 1%）
- サウンド再生の非同期処理

### ディスク使用量

- JSONファイルの圧縮保存検討
- ログローテーション（古いセッションデータの自動削除）
- 設定ファイルの最小化

### 応答性

- UI操作の即座の反映（楽観的更新）
- 長時間実行操作の非同期処理
- Check-inダイアログの即座の表示（< 100ms）

## セキュリティ考慮事項

### データ保護

- ローカルファイルシステムのみ使用（外部送信なし）
- ファイル権限の適切な設定（ユーザーのみアクセス可能）
- 機密情報の非保存（個人識別情報は扱わない）

### システム権限

- 最小権限の原則（必要な権限のみ要求）
- 権限取得失敗時の優雅な劣化
- サンドボックス環境での安全な動作

### 入力検証

- ユーザー入力の厳格な検証（時間、文字列長制限）
- JSONデシリアライゼーション時の型安全性
- ファイルパスの検証（ディレクトリトラバーサル防止）