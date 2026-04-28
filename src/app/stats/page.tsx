"use client";

import { Stats } from "@/lib/types";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const emptyStats: Stats = {
  totalBooks: 0,
  readBooks: 0,
  totalQuotes: 0,
  totalPages: 0,
  avgRating: 0,
  readThisYear: 0,
  averagePerYear: 0,
  booksPerYear: [],
  booksPerAuthor: [],
  booksPerStatus: [],
  booksPerMonthByYear: {},
};

function topAuthors(stats: Stats) {
  return [...stats.booksPerAuthor].sort((a, b) => b.value - a.value).slice(0, 10);
}

export default function StatsPage() {
  const { status } = useSession();
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    fetch("/api/stats")
      .then(async (response) => {
        const data = (await response.json()) as { stats?: Stats; error?: string };
        if (!response.ok || !data.stats) {
          throw new Error(data.error ?? "Load failed.");
        }

        return data.stats;
      })
      .then((nextStats) => {
        setStats(nextStats);
        const years = nextStats.booksPerYear
          .map((item) => item.key)
          .filter((year) => /^\d{4}$/.test(year))
          .sort();
        if (years.length > 0) {
          setSelectedYear(years[years.length - 1]);
        }
      })
      .catch((loadError: unknown) => {
        const message = loadError instanceof Error ? loadError.message : "Load failed.";
        setError(message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [status]);

  const yearRows = useMemo(
    () => stats.booksPerYear.filter((item) => /^\d{4}$/.test(item.key)),
    [stats.booksPerYear],
  );
  const yearMax = Math.max(1, ...yearRows.map((item) => item.value));
  const selectedMonths = stats.booksPerMonthByYear[selectedYear] ?? Array(12).fill(0);
  const monthMax = Math.max(1, ...selectedMonths);
  const authors = topAuthors(stats);

  if (status === "loading") {
    return <main className="center-screen">Loading...</main>;
  }

  if (status !== "authenticated") {
    return (
      <main className="center-screen">
        <section className="card auth-card">
          <h1>My Books - Statistiky</h1>
          <p>Prihlásenie je povolené iba pre tvoj účet.</p>
          <button type="button" className="btn primary" onClick={() => signIn("google")}>
            Prihlásiť sa cez Google
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>Statistiky a grafy</h1>
          <p className="muted">Prehľad čítania podľa rokov, mesiacov a autorov.</p>
        </div>
        <Link href="/" className="btn secondary link-btn">
          Späť na hlavnú stránku
        </Link>
      </header>

      {loading ? <section className="card">Načítavam...</section> : null}
      {error ? <section className="card message-error">{error}</section> : null}

      <section className="stats-grid">
        <article className="card">
          <div className="muted">Prečítané knihy</div>
          <div className="stat-number">{stats.readBooks}</div>
        </article>
        <article className="card">
          <div className="muted">Prečítané tento rok</div>
          <div className="stat-number">{stats.readThisYear}</div>
        </article>
        <article className="card">
          <div className="muted">Ročný priemer</div>
          <div className="stat-number">{stats.averagePerYear}</div>
        </article>
        <article className="card">
          <div className="muted">Priemerné hodnotenie</div>
          <div className="stat-number">{stats.avgRating}</div>
        </article>
      </section>

      <section className="card">
        <h2>Knihy podľa rokov</h2>
        <div className="chart-list">
          {yearRows.map((item) => (
            <div key={item.key} className="chart-row">
              <span className="chart-label">{item.key}</span>
              <div className="chart-bar-wrap">
                <div className="chart-bar" style={{ width: `${Math.max(4, (item.value / yearMax) * 100)}%` }} />
              </div>
              <span className="chart-value">{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="two-col">
        <article className="card">
          <h2>Mesačný graf</h2>
          <label>Rok</label>
          <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
            {yearRows.map((item) => (
              <option key={item.key} value={item.key}>
                {item.key}
              </option>
            ))}
          </select>
          <div className="chart-grid-months">
            {monthLabels.map((month, index) => (
              <div key={month} className="month-bar-column">
                <div className="month-bar-wrap">
                  <div
                    className="month-bar"
                    style={{ height: `${Math.max(6, ((selectedMonths[index] ?? 0) / monthMax) * 100)}%` }}
                  />
                </div>
                <div className="small-text">{month}</div>
                <div className="small-text muted">{selectedMonths[index] ?? 0}</div>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Top autori</h2>
          {authors.map((item) => (
            <div key={item.key} className="pair-row">
              <span>{item.key}</span>
              <span className="badge">{item.value}</span>
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}
