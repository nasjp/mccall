import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import type { SessionStats } from "../types/mccall";

type StatsCardProps = {
  title: string;
  stats: SessionStats | null;
  loading: boolean;
};

type StatItem = {
  label: string;
  value: string;
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfWeek = (date: Date) => {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  if (minutes <= 0) {
    return seconds > 0 ? "1分未満" : "0分";
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return remainingMinutes > 0
      ? `${hours}時間${remainingMinutes}分`
      : `${hours}時間`;
  }
  return `${minutes}分`;
};

const formatRate = (value: number, hasData: boolean) =>
  hasData ? `${Math.round(value * 100)}%` : "—";

const buildStatItems = (stats: SessionStats): StatItem[] => {
  const checkInTotal = stats.checkInDoneCount + stats.checkInSkipCount;
  const skipRate = checkInTotal > 0 ? stats.checkInSkipCount / checkInTotal : 0;

  return [
    { label: "実行回数", value: `${stats.cyclesCount}回` },
    { label: "作業時間", value: formatDuration(stats.workSeconds) },
    { label: "休憩時間", value: formatDuration(stats.breakSeconds) },
    { label: "合計時間", value: formatDuration(stats.totalSeconds) },
    {
      label: "Check-in skip率",
      value: formatRate(skipRate, checkInTotal > 0),
    },
    {
      label: "ミュート率",
      value: formatRate(stats.muteRate, stats.sessionsCount > 0),
    },
  ];
};

const StatsCard = ({ title, stats, loading }: StatsCardProps) => {
  const items = useMemo(() => (stats ? buildStatItems(stats) : []), [stats]);
  return (
    <section className="stats-card" aria-label={`${title}の統計`}>
      <div className="stats-card__header">
        <h3 className="stats-card__title">{title}</h3>
        {stats && stats.sessionsCount === 0 ? (
          <span className="stats-card__note">記録なし</span>
        ) : null}
      </div>
      {loading && !stats ? (
        <p className="empty-text">読み込み中...</p>
      ) : stats ? (
        <dl className="stats-card__list">
          {items.map((item) => (
            <div key={item.label} className="stats-card__row">
              <dt className="stats-card__label">{item.label}</dt>
              <dd className="stats-card__value">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="empty-text">データがありません</p>
      )}
    </section>
  );
};

export const StatsView = () => {
  const [todayStats, setTodayStats] = useState<SessionStats | null>(null);
  const [weekStats, setWeekStats] = useState<SessionStats | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);

    setStatus("loading");
    setErrorMessage(null);

    Promise.all([
      invoke<SessionStats>("get_session_stats", {
        from: todayStart.toISOString(),
        to: now.toISOString(),
      }),
      invoke<SessionStats>("get_session_stats", {
        from: weekStart.toISOString(),
        to: now.toISOString(),
      }),
    ])
      .then(([today, week]) => {
        if (!active) {
          return;
        }
        setTodayStats(today);
        setWeekStats(week);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        console.error("Failed to load session stats", error);
        setErrorMessage("統計の取得に失敗しました");
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const isLoading = status === "loading" || status === "idle";

  return (
    <section className="panel stats-view" aria-label="統計">
      <header className="stats-view__header">
        <h2 className="section-title">Stats</h2>
        <p className="stats-view__subtitle">今日と今週のまとめ</p>
      </header>
      {status === "error" ? <p className="empty-text">{errorMessage}</p> : null}
      <div className="stats-view__grid">
        <StatsCard title="今日" stats={todayStats} loading={isLoading} />
        <StatsCard title="今週" stats={weekStats} loading={isLoading} />
      </div>
    </section>
  );
};
