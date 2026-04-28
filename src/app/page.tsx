"use client";

import {
  Book,
  CbdbMetadata,
  CbdbSuggestion,
  PagedBooks,
  Quote,
  SeriesProgress,
  Stats,
} from "@/lib/types";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Message = {
  text: string;
  ok: boolean;
};

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

const emptyBookForm = {
  id: "",
  title: "",
  author: "",
  status: "read",
  startedAt: "",
  finishedAt: "",
  rating: "",
  pages: "",
  genre: "",
  publisher: "",
  isbn: "",
  language: "",
  notes: "",
  cbdbUrl: "",
};

const pageSize = 25;
const seriesTitleSuffixPattern = /\(([^()]*?)\s+(\d+)\)\s*$/;

export default function Home() {
  const { status, data: session } = useSession();
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [statsLoading, setStatsLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [booksPage, setBooksPage] = useState<PagedBooks>({
    items: [],
    total: 0,
    page: 1,
    pageSize,
    totalPages: 1,
  });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [seriesProgress, setSeriesProgress] = useState<SeriesProgress | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [filter, setFilter] = useState("");
  const [saveBookLoading, setSaveBookLoading] = useState(false);
  const [enrichBookLoading, setEnrichBookLoading] = useState(false);
  const [bookMessage, setBookMessage] = useState<Message | null>(null);
  const [quoteMessage, setQuoteMessage] = useState<Message | null>(null);
  const [cbdbResult, setCbdbResult] = useState("");
  const [bookForm, setBookForm] = useState(emptyBookForm);
  const [quoteForm, setQuoteForm] = useState({
    id: "",
    quote: "",
    page: "",
    context: "",
    tags: "",
  });
  const [cbdbQuery, setCbdbQuery] = useState("");
  const [titleSuggestions, setTitleSuggestions] = useState<CbdbSuggestion[]>([]);
  const [titleSuggestLoading, setTitleSuggestLoading] = useState(false);
  const skipSuggestionQueryRef = useRef(false);

  const selectedBook = useMemo(
    () => booksPage.items.find((book) => book.id === selectedBookId) ?? null,
    [booksPage.items, selectedBookId],
  );
  const isSeriesBook = useCallback((title: string) => seriesTitleSuffixPattern.test(title.trim()), []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await fetch("/api/stats");
      const data = (await response.json()) as { stats?: Stats; error?: string };
      if (!response.ok || !data.stats) {
        throw new Error(data.error ?? "Load failed.");
      }

      setStats(data.stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load failed.";
      setBookMessage({ ok: false, text: message });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadBooksPage = useCallback(async (page: number, query: string) => {
    setListLoading(true);
    try {
      const response = await fetch(
        `/api/books?page=${page}&pageSize=${pageSize}&filter=${encodeURIComponent(query)}`,
      );
      const data = (await response.json()) as PagedBooks | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Load failed.");
      }

      setBooksPage(data as PagedBooks);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load failed.";
      setBookMessage({ ok: false, text: message });
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadQuotes = useCallback(async (bookId: string) => {
    if (!bookId) {
      setQuotes([]);
      return;
    }

    setQuotesLoading(true);
    try {
      const response = await fetch(`/api/quotes?bookId=${encodeURIComponent(bookId)}`);
      const data = (await response.json()) as { items?: Quote[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Load failed.");
      }

      setQuotes(data.items ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load failed.";
      setQuoteMessage({ ok: false, text: message });
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  const loadSeriesProgress = useCallback(async (bookId: string) => {
    if (!bookId) {
      setSeriesProgress(null);
      return;
    }

    try {
      const response = await fetch(`/api/books/${bookId}/series`);
      const data = (await response.json()) as {
        series?: SeriesProgress | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Load failed.");
      }

      setSeriesProgress(data.series ?? null);
    } catch {
      setSeriesProgress(null);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadStats();
      void loadBooksPage(1, "");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadBooksPage, loadStats, status]);

  useEffect(() => {
    const query = bookForm.title.trim();
    if (skipSuggestionQueryRef.current) {
      skipSuggestionQueryRef.current = false;
      return;
    }

    if (query.length < 2) {
      const timer = window.setTimeout(() => setTitleSuggestions([]), 0);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      setTitleSuggestLoading(true);
      try {
        const response = await fetch(`/api/cbdb?mode=search&q=${encodeURIComponent(query)}`);
        const data = (await response.json()) as { suggestions?: CbdbSuggestion[]; error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "CBDB search failed.");
        }

        if (!cancelled) {
          setTitleSuggestions(data.suggestions ?? []);
        }
      } catch {
        if (!cancelled) {
          setTitleSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setTitleSuggestLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [bookForm.title]);

  async function handleSuggestionSelect(item: CbdbSuggestion) {
    skipSuggestionQueryRef.current = true;
    setTitleSuggestions([]);
    setTitleSuggestLoading(false);
    setBookForm((prev) => ({
      ...prev,
      title: item.title || prev.title,
      author: item.author || prev.author,
      cbdbUrl: item.url || prev.cbdbUrl,
    }));

    try {
      const response = await fetch(`/api/cbdb?q=${encodeURIComponent(item.url)}`);
      const data = (await response.json()) as CbdbMetadata | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error : "CBDB lookup failed.");
      }

      const metadata = data as CbdbMetadata;
      setBookForm((prev) => ({
        ...prev,
        title: metadata.pageTitle || item.title || prev.title,
        author: metadata.author || prev.author,
        publisher: prev.publisher || metadata.publisher || "",
        isbn: prev.isbn || metadata.isbn || "",
        pages: prev.pages || (metadata.pages ? String(metadata.pages) : ""),
        cbdbUrl: metadata.canonicalUrl || item.url || prev.cbdbUrl,
      }));
    } catch {
      // Keep prefilled values from selected suggestion when metadata fetch fails.
    }
  }

  async function refreshAfterBookChange() {
    await Promise.all([loadStats(), loadBooksPage(booksPage.page, filter)]);
  }

  async function saveBook() {
    setBookMessage(null);
    setSaveBookLoading(true);
    const payload = {
      title: bookForm.title,
      author: bookForm.author,
      status: bookForm.status,
      startedAt: bookForm.startedAt,
      finishedAt: bookForm.finishedAt,
      rating: bookForm.rating,
      pages: bookForm.pages,
      genre: bookForm.genre,
      publisher: bookForm.publisher,
      isbn: bookForm.isbn,
      language: bookForm.language,
      notes: bookForm.notes,
      cbdbUrl: bookForm.cbdbUrl,
    };

    try {
      const response = await fetch(
        bookForm.id ? `/api/books/${bookForm.id}` : "/api/books",
        {
          method: bookForm.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json()) as Book | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Save failed.");
      }

      const savedBook = data as Book;
      setSelectedBookId(savedBook.id);
      setBookForm((prev) => ({ ...prev, id: savedBook.id }));
      setTitleSuggestions([]);
      await refreshAfterBookChange();
      await loadQuotes(savedBook.id);
      await loadSeriesProgress(savedBook.id);
      setBookMessage({ ok: true, text: "Kniha bola úspešne uložená." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed.";
      setBookMessage({ ok: false, text: message });
    } finally {
      setSaveBookLoading(false);
    }
  }

  async function saveQuote() {
    if (!selectedBookId) {
      setQuoteMessage({ ok: false, text: "Najprv vyber knihu." });
      return;
    }

    setQuoteMessage(null);
    const payload = {
      bookId: selectedBookId,
      quote: quoteForm.quote,
      page: quoteForm.page,
      context: quoteForm.context,
      tags: quoteForm.tags,
    };

    try {
      const response = await fetch(
        quoteForm.id ? `/api/quotes/${quoteForm.id}` : "/api/quotes",
        {
          method: quoteForm.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json()) as Quote | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Save failed.");
      }

      setQuoteForm({ id: "", quote: "", page: "", context: "", tags: "" });
      await Promise.all([loadStats(), loadQuotes(selectedBookId)]);
      setQuoteMessage({ ok: true, text: "Citát uložený." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed.";
      setQuoteMessage({ ok: false, text: message });
    }
  }

  async function removeQuote(id: string) {
    try {
      const response = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Delete failed.");
      }

      await Promise.all([loadStats(), loadQuotes(selectedBookId)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed.";
      setQuoteMessage({ ok: false, text: message });
    }
  }

  async function loadCbdb() {
    setCbdbResult("Načítavam...");
    try {
      const response = await fetch(`/api/cbdb?q=${encodeURIComponent(cbdbQuery)}`);
      const data = (await response.json()) as CbdbMetadata | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error : "CBDB lookup failed.");
      }

      const metadata = data as CbdbMetadata;
      const output = [
        metadata.pageTitle ? `Názov: ${metadata.pageTitle}` : "",
        metadata.author ? `Autor: ${metadata.author}` : "",
        metadata.publisher ? `Vydavateľ: ${metadata.publisher}` : "",
        metadata.pages ? `Počet strán: ${metadata.pages}` : "",
        metadata.isbn ? `ISBN: ${metadata.isbn}` : "",
        metadata.description ? `Popis: ${metadata.description}` : "",
        metadata.canonicalUrl ? `URL: ${metadata.canonicalUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      setCbdbResult(output || "Bez vysledku.");
      setBookForm((prev) => ({
        ...prev,
        title: prev.title || metadata.pageTitle || "",
        author: prev.author || metadata.author || "",
        publisher: prev.publisher || metadata.publisher || "",
        isbn: prev.isbn || metadata.isbn || "",
        pages: prev.pages || (metadata.pages ? String(metadata.pages) : ""),
        cbdbUrl: prev.cbdbUrl || metadata.canonicalUrl || "",
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "CBDB lookup failed.";
      setCbdbResult(`Chyba: ${message}`);
    }
  }

  async function enrichSelectedBookFromCbdb() {
    if (!selectedBookId) {
      setBookMessage({ ok: false, text: "Najprv vyber knihu." });
      return;
    }

    setBookMessage(null);
    setEnrichBookLoading(true);
    try {
      const response = await fetch(`/api/books/${selectedBookId}/enrich`, {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Metadata enrich failed.");
      }

      await Promise.all([
        refreshAfterBookChange(),
        loadQuotes(selectedBookId),
        loadSeriesProgress(selectedBookId),
      ]);
      setBookMessage({ ok: true, text: "Metadáta z CBDB doplnené." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Metadata enrich failed.";
      setBookMessage({ ok: false, text: message });
    } finally {
      setEnrichBookLoading(false);
    }
  }

  function selectBook(book: Book) {
    skipSuggestionQueryRef.current = true;
    setSelectedBookId(book.id);
    setTitleSuggestions([]);
    setQuoteForm({ id: "", quote: "", page: "", context: "", tags: "" });
    setBookForm({
      id: book.id,
      title: book.title,
      author: book.author,
      status: book.status || "read",
      startedAt: book.startedAt || "",
      finishedAt: book.finishedAt || "",
      rating: String(book.rating || ""),
      pages: String(book.pages || ""),
      genre: book.genre || "",
      publisher: book.publisher || "",
      isbn: book.isbn || "",
      language: book.language || "",
      notes: book.notes || "",
      cbdbUrl: book.cbdbUrl || "",
    });
    void loadQuotes(book.id);
    void loadSeriesProgress(book.id);
  }

  if (status === "loading") {
    return <main className="center-screen">Loading...</main>;
  }

  if (status !== "authenticated") {
    return (
      <main className="center-screen">
        <section className="card auth-card">
          <h1 className="page-title">My Books</h1>
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
          <h1 className="page-title">My Books</h1>
          <p className="muted">Prehľad kníh, citátov a štatistík nad Google Sheets.</p>
        </div>
        <div className="header-actions">
          <Link href="/stats" className="btn primary link-btn header-btn header-stats-btn">
            Štatistiky
          </Link>
          <button
            type="button"
            className="btn secondary link-btn header-btn header-logout-btn"
            onClick={() => signOut()}
          >
            Odhlásiť
          </button>
          <span className="badge session-email">{session?.user?.email}</span>
        </div>
      </header>

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

      {statsLoading ? <div className="card muted">Načítavam štatistiky...</div> : null}

      <section className="two-col">
        <article className="card">
          <h2>Pridať / upraviť knihu</h2>
          <label>Názov *</label>
          <input
            value={bookForm.title}
            onChange={(event) => setBookForm((prev) => ({ ...prev, title: event.target.value }))}
          />
          <div className="muted small-text">
            {titleSuggestLoading ? "Hladam na CBDB..." : "Pri pisani sa automaticky hlada na CBDB."}
          </div>
          {titleSuggestions.length > 0 ? (
            <div className="suggestions">
              {titleSuggestions.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  className="suggestion-item"
                  onClick={() => void handleSuggestionSelect(item)}
                >
                  <strong>{item.title}</strong>
                  <span className="muted">{item.url}</span>
                </button>
              ))}
            </div>
          ) : null}

          <label>Autor</label>
          <input
            value={bookForm.author}
            onChange={(event) => setBookForm((prev) => ({ ...prev, author: event.target.value }))}
          />

          <div className="row">
            <div>
              <label>Stav</label>
              <select
                value={bookForm.status}
                onChange={(event) =>
                  setBookForm((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                <option value="read">read</option>
                <option value="reading">reading</option>
                <option value="planned">planned</option>
              </select>
            </div>
            <div>
              <label>Hodnotenie</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.5"
                value={bookForm.rating}
                onChange={(event) =>
                  setBookForm((prev) => ({ ...prev, rating: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label>Začiatok</label>
              <input
                value={bookForm.startedAt}
                onChange={(event) =>
                  setBookForm((prev) => ({ ...prev, startedAt: event.target.value }))
                }
              />
            </div>
            <div>
              <label>Dátum prečítania</label>
              <input
                placeholder="napr. 29.5.2020"
                value={bookForm.finishedAt}
                onChange={(event) =>
                  setBookForm((prev) => ({ ...prev, finishedAt: event.target.value }))
                }
              />
            </div>
          </div>

          <label>CBDB URL</label>
          <input
            value={bookForm.cbdbUrl}
            onChange={(event) =>
              setBookForm((prev) => ({ ...prev, cbdbUrl: event.target.value }))
            }
          />

          {seriesProgress ? (
            <div className="series-box">
              <p className="muted">
                Séria: <strong>{seriesProgress.seriesName}</strong>
              </p>
              {seriesProgress.books.length ? (
                seriesProgress.books.map((item) => (
                  <div key={item.id} className="small-text series-item-row">
                    <span className={item.isRead ? "series-check" : "series-check-empty"}>
                      {item.isRead ? "✅" : ""}
                    </span>
                    {item.cbdbUrl ? (
                      <a href={item.cbdbUrl} target="_blank" rel="noreferrer">
                        {item.order}. {item.title}
                      </a>
                    ) : (
                      <span>
                        {item.order}. {item.title}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="small-text muted">Nenašli sa diely série.</div>
              )}
            </div>
          ) : null}

          <label>Poznámka</label>
          <textarea
            value={bookForm.notes}
            onChange={(event) => setBookForm((prev) => ({ ...prev, notes: event.target.value }))}
          />

          <div className="row mt form-actions-row">
            <button
              type="button"
              className="btn primary"
              onClick={saveBook}
              disabled={saveBookLoading}
            >
              {saveBookLoading ? "Ukladám knihu..." : "Uložiť knihu"}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={enrichSelectedBookFromCbdb}
              disabled={enrichBookLoading}
              title="Doplniť metadáta z CBDB pre vybranú knihu"
            >
              {enrichBookLoading ? "Načítavam z CBDB..." : "Načítaj z CBDB"}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setBookForm(emptyBookForm);
                setSelectedBookId("");
                setQuotes([]);
                setSeriesProgress(null);
                setBookMessage(null);
              }}
            >
              Nová kniha
            </button>
          </div>

          <label className="mt">Ručné dohľadanie metadát z cbdb.cz</label>
          <div className="row">
            <input
              value={cbdbQuery}
              onChange={(event) => setCbdbQuery(event.target.value)}
              placeholder="Názov knihy alebo URL"
            />
            <button type="button" className="btn secondary" onClick={loadCbdb}>
              Načítať
            </button>
          </div>
          <pre className="muted pre-wrap">{cbdbResult}</pre>
          {saveBookLoading ? <p className="muted">Prebieha ukladanie knihy...</p> : null}
          {enrichBookLoading ? <p className="muted">Načítavam metadáta z CBDB...</p> : null}
          {bookMessage ? (
            <p className={bookMessage.ok ? "message-ok" : "message-error"}>{bookMessage.text}</p>
          ) : null}
        </article>

        <article className="card">
          <h2>Knihy</h2>
          <div className="row">
            <input
                placeholder="Filter názov/autor..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <button type="button" className="btn secondary" onClick={() => void loadBooksPage(1, filter)}>
              Hľadať
            </button>
          </div>
          {listLoading ? <p className="muted">Načítavam zoznam...</p> : null}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Názov</th>
                  <th>Autor</th>
                  <th>Dátum</th>
                  <th>Rating</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {booksPage.items.length ? (
                  booksPage.items.map((book) => (
                    <tr key={book.id} className="clickable" onClick={() => selectBook(book)}>
                      <td>
                        <span>{book.title}</span>
                        {isSeriesBook(book.title) ? <span className="series-mark">Séria</span> : null}
                      </td>
                      <td>{book.author}</td>
                      <td>{book.finishedAt}</td>
                      <td>{book.rating || ""}</td>
                      <td className="book-link-cell">
                        {book.cbdbUrl ? (
                          <a
                            href={book.cbdbUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn secondary compact link-btn row-cbdb-btn"
                            onClick={(e) => e.stopPropagation()}
                          >
                            CBDB
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">
                      Bez dát.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination-row">
            <button
              type="button"
              className="btn secondary compact"
              disabled={listLoading || booksPage.page <= 1}
              onClick={() => void loadBooksPage(1, filter)}
            >
              Prvá
            </button>
            <button
              type="button"
              className="btn secondary compact"
              disabled={listLoading || booksPage.page <= 1}
              onClick={() => void loadBooksPage(booksPage.page - 1, filter)}
            >
              Predošlá
            </button>
            <span className="muted small-text">
              Strana {booksPage.page} / {booksPage.totalPages} ({booksPage.total} knih)
            </span>
            <button
              type="button"
              className="btn secondary compact"
              disabled={listLoading || booksPage.page >= booksPage.totalPages}
              onClick={() => void loadBooksPage(booksPage.page + 1, filter)}
            >
              Ďalšia
            </button>
            <button
              type="button"
              className="btn secondary compact"
              disabled={listLoading || booksPage.page >= booksPage.totalPages}
              onClick={() => void loadBooksPage(booksPage.totalPages, filter)}
            >
              Posledná
            </button>
          </div>
          {listLoading ? <p className="muted small-text">Načítavam stránku...</p> : null}
        </article>
      </section>

      <section className="two-col">
        <article className="card">
          <h2>Citáty ku knihe</h2>
          <p className="muted">
            {selectedBook
              ? `Vybraná kniha: ${selectedBook.title} (${selectedBook.author || "bez autora"})`
              : "Najprv vyber knihu z tabuľky."}
          </p>
          {quotesLoading ? <p className="muted">Načítavam citáty...</p> : null}

          <label>Citát *</label>
          <textarea
            value={quoteForm.quote}
            onChange={(event) => setQuoteForm((prev) => ({ ...prev, quote: event.target.value }))}
          />
          <div className="row">
            <div>
              <label>Strana</label>
              <input
                value={quoteForm.page}
                onChange={(event) => setQuoteForm((prev) => ({ ...prev, page: event.target.value }))}
              />
            </div>
            <div>
              <label>Tagy</label>
              <input
                value={quoteForm.tags}
                onChange={(event) => setQuoteForm((prev) => ({ ...prev, tags: event.target.value }))}
              />
            </div>
          </div>
          <label>Kontext</label>
          <textarea
            value={quoteForm.context}
            onChange={(event) => setQuoteForm((prev) => ({ ...prev, context: event.target.value }))}
          />
          <div className="row mt">
            <button type="button" className="btn primary" onClick={saveQuote}>
              Uložiť citát
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setQuoteForm({ id: "", quote: "", page: "", context: "", tags: "" })}
            >
              Vyčistiť
            </button>
          </div>
          {quoteMessage ? (
            <p className={quoteMessage.ok ? "message-ok" : "message-error"}>{quoteMessage.text}</p>
          ) : null}
        </article>

        <article className="card">
          <h2>Zoznam citátov</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Citát</th>
                  <th>Strana</th>
                  <th>Tagy</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {quotes.length ? (
                  quotes.map((quote) => (
                    <tr key={quote.id}>
                      <td>{quote.quote}</td>
                      <td>{quote.page}</td>
                      <td>{quote.tags}</td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn secondary compact"
                          onClick={() =>
                            setQuoteForm({
                              id: quote.id,
                              quote: quote.quote,
                              page: quote.page,
                              context: quote.context,
                              tags: quote.tags,
                            })
                          }
                        >
                          Edit
                        </button>
                        <button type="button" className="btn danger compact" onClick={() => removeQuote(quote.id)}>
                          X
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="muted">
                      Bez citátov.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
