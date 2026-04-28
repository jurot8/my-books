"use client";

import { BootstrapData, Book, Quote, Stats } from "@/lib/types";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type Message = {
  text: string;
  ok: boolean;
};

const emptyStats: Stats = {
  totalBooks: 0,
  totalQuotes: 0,
  totalPages: 0,
  avgRating: 0,
  booksPerYear: [],
  booksPerAuthor: [],
  booksPerStatus: [],
};

export default function Home() {
  const { status, data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState<Book[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [selectedBookId, setSelectedBookId] = useState<string>("");
  const [filter, setFilter] = useState("");
  const [bookMessage, setBookMessage] = useState<Message | null>(null);
  const [quoteMessage, setQuoteMessage] = useState<Message | null>(null);
  const [cbdbResult, setCbdbResult] = useState<string>("");

  const [bookForm, setBookForm] = useState({
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
  });

  const [quoteForm, setQuoteForm] = useState({
    id: "",
    quote: "",
    page: "",
    context: "",
    tags: "",
  });

  const [cbdbQuery, setCbdbQuery] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    fetch("/api/bootstrap")
      .then(async (response) => {
        if (!response.ok) {
          const error = (await response.json()) as { error?: string };
          throw new Error(error.error ?? "Load failed.");
        }

        return (await response.json()) as BootstrapData;
      })
      .then((data) => {
        setBooks(data.books);
        setQuotes(data.quotes);
        setStats(data.stats);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Load failed.";
        setBookMessage({ ok: false, text: message });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [status]);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? null,
    [books, selectedBookId],
  );

  const filteredBooks = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return books;
    }

    return books.filter((book) => {
      const title = book.title.toLowerCase();
      const author = book.author.toLowerCase();
      return title.includes(query) || author.includes(query);
    });
  }, [books, filter]);

  const selectedQuotes = useMemo(
    () => quotes.filter((quote) => quote.bookId === selectedBookId),
    [quotes, selectedBookId],
  );

  function refreshLocalStats(nextBooks: Book[], nextQuotes: Quote[]) {
    const byYear: Record<string, number> = {};
    const byAuthor: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalPages = 0;

    const rated = nextBooks.filter((book) => Number(book.rating) > 0);
    for (const book of nextBooks) {
      const finishedAt = String(book.finishedAt ?? "");
      const year = finishedAt.match(/(\d{4})/)?.[1] ?? "Nezadane";
      byYear[year] = (byYear[year] ?? 0) + 1;

      const author = book.author || "Neznamy autor";
      byAuthor[author] = (byAuthor[author] ?? 0) + 1;

      const statusValue = book.status || "unknown";
      byStatus[statusValue] = (byStatus[statusValue] ?? 0) + 1;

      totalPages += Number(book.pages) || 0;
    }

    const avgRating = rated.length
      ? rated.reduce((sum, book) => sum + (Number(book.rating) || 0), 0) /
        rated.length
      : 0;

    const toPairs = (source: Record<string, number>) =>
      Object.keys(source)
        .sort()
        .map((key) => ({ key, value: source[key] }));

    setStats({
      totalBooks: nextBooks.length,
      totalQuotes: nextQuotes.length,
      totalPages,
      avgRating: Number(avgRating.toFixed(2)),
      booksPerYear: toPairs(byYear),
      booksPerAuthor: toPairs(byAuthor),
      booksPerStatus: toPairs(byStatus),
    });
  }

  async function saveBook() {
    setBookMessage(null);
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

      const book = data as Book;
      const nextBooks = bookForm.id
        ? books.map((item) => (item.id === book.id ? book : item))
        : [...books, book];
      setBooks(nextBooks);
      setSelectedBookId(book.id);
      refreshLocalStats(nextBooks, quotes);
      setBookMessage({ ok: true, text: "Kniha ulozena." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Save failed.";
      setBookMessage({ ok: false, text: message });
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

      const quote = data as Quote;
      const nextQuotes = quoteForm.id
        ? quotes.map((item) => (item.id === quote.id ? quote : item))
        : [...quotes, quote];
      setQuotes(nextQuotes);
      refreshLocalStats(books, nextQuotes);
      setQuoteForm({ id: "", quote: "", page: "", context: "", tags: "" });
      setQuoteMessage({ ok: true, text: "Citat ulozeny." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Save failed.";
      setQuoteMessage({ ok: false, text: message });
    }
  }

  async function removeQuote(id: string) {
    try {
      const response = await fetch(`/api/quotes/${id}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Delete failed.");
      }

      const nextQuotes = quotes.filter((quote) => quote.id !== id);
      setQuotes(nextQuotes);
      refreshLocalStats(books, nextQuotes);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Delete failed.";
      setQuoteMessage({ ok: false, text: message });
    }
  }

  async function loadCbdb() {
    setCbdbResult("Nacitavam...");
    try {
      const response = await fetch(`/api/cbdb?q=${encodeURIComponent(cbdbQuery)}`);
      const data = (await response.json()) as {
        error?: string;
        pageTitle?: string;
        description?: string;
        canonicalUrl?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "CBDB lookup failed.");
      }

      const output = [
        data.pageTitle ? `Nazov: ${data.pageTitle}` : "",
        data.description ? `Popis: ${data.description}` : "",
        data.canonicalUrl ? `URL: ${data.canonicalUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      setCbdbResult(output || "Bez vysledku.");
      if (!bookForm.title && data.pageTitle) {
        setBookForm((prev) => ({ ...prev, title: data.pageTitle ?? prev.title }));
      }
      if (!bookForm.cbdbUrl && data.canonicalUrl) {
        setBookForm((prev) => ({ ...prev, cbdbUrl: data.canonicalUrl ?? prev.cbdbUrl }));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "CBDB lookup failed.";
      setCbdbResult(`Chyba: ${message}`);
    }
  }

  function selectBook(book: Book) {
    setSelectedBookId(book.id);
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
  }

  if (status === "loading") {
    return <main className="center-screen">Loading...</main>;
  }

  if (status !== "authenticated") {
    return (
      <main className="center-screen">
        <section className="card auth-card">
          <h1>My Books</h1>
          <p>Prihlasenie je povolene iba pre tvoj ucet.</p>
          <button type="button" className="btn primary" onClick={() => signIn("google")}>
            Prihlasit sa cez Google
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>My Books</h1>
          <p className="muted">Prehlad knih, citatov a statistik nad Google Sheets.</p>
        </div>
        <div className="header-actions">
          <span className="badge">{session?.user?.email}</span>
          <button type="button" className="btn secondary" onClick={() => signOut()}>
            Odhlasit
          </button>
        </div>
      </header>

      {loading ? <div className="card">Nacitavam data...</div> : null}

      <section className="stats-grid">
        <article className="card">
          <div className="muted">Knihy</div>
          <div className="stat-number">{stats.totalBooks}</div>
        </article>
        <article className="card">
          <div className="muted">Citaty</div>
          <div className="stat-number">{stats.totalQuotes}</div>
        </article>
        <article className="card">
          <div className="muted">Priemerne hodnotenie</div>
          <div className="stat-number">{stats.avgRating}</div>
        </article>
      </section>

      <section className="two-col">
        <article className="card">
          <h2>Pridat / upravit knihu</h2>

          <label>Nazov *</label>
          <input
            value={bookForm.title}
            onChange={(event) => setBookForm((prev) => ({ ...prev, title: event.target.value }))}
          />

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
              <label>Zaciatok</label>
              <input
                value={bookForm.startedAt}
                onChange={(event) =>
                  setBookForm((prev) => ({ ...prev, startedAt: event.target.value }))
                }
              />
            </div>
            <div>
              <label>Dokoncenie</label>
              <input
                placeholder="napr. 29.5.2020"
                value={bookForm.finishedAt}
                onChange={(event) =>
                  setBookForm((prev) => ({ ...prev, finishedAt: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label>Pocet stran</label>
              <input
                type="number"
                min="0"
                value={bookForm.pages}
                onChange={(event) =>
                  setBookForm((prev) => ({ ...prev, pages: event.target.value }))
                }
              />
            </div>
            <div>
              <label>Jazyk</label>
              <input
                value={bookForm.language}
                onChange={(event) =>
                  setBookForm((prev) => ({ ...prev, language: event.target.value }))
                }
              />
            </div>
          </div>

          <label>Zaner</label>
          <input
            value={bookForm.genre}
            onChange={(event) => setBookForm((prev) => ({ ...prev, genre: event.target.value }))}
          />

          <label>Vydavatel</label>
          <input
            value={bookForm.publisher}
            onChange={(event) =>
              setBookForm((prev) => ({ ...prev, publisher: event.target.value }))
            }
          />

          <label>ISBN</label>
          <input
            value={bookForm.isbn}
            onChange={(event) => setBookForm((prev) => ({ ...prev, isbn: event.target.value }))}
          />

          <label>CBDB URL</label>
          <input
            value={bookForm.cbdbUrl}
            onChange={(event) =>
              setBookForm((prev) => ({ ...prev, cbdbUrl: event.target.value }))
            }
          />

          <label>Poznamka</label>
          <textarea
            value={bookForm.notes}
            onChange={(event) => setBookForm((prev) => ({ ...prev, notes: event.target.value }))}
          />

          <div className="row mt">
            <button type="button" className="btn primary" onClick={saveBook}>
              Ulozit knihu
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                setBookForm({
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
                })
              }
            >
              Vycistit
            </button>
          </div>

          <label className="mt">Dotiahnut metadata z cbdb.cz</label>
          <div className="row">
            <input
              value={cbdbQuery}
              onChange={(event) => setCbdbQuery(event.target.value)}
              placeholder="Nazov knihy alebo URL"
            />
            <button type="button" className="btn secondary" onClick={loadCbdb}>
              Nacitat
            </button>
          </div>
          <pre className="muted pre-wrap">{cbdbResult}</pre>

          {bookMessage ? (
            <p className={bookMessage.ok ? "message-ok" : "message-error"}>
              {bookMessage.text}
            </p>
          ) : null}
        </article>

        <article className="card">
          <h2>Knihy</h2>
          <input
            placeholder="Filter nazov/autor..."
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <table>
            <thead>
              <tr>
                <th>Nazov</th>
                <th>Autor</th>
                <th>Stav</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {filteredBooks.length ? (
                filteredBooks.map((book) => (
                  <tr
                    key={book.id}
                    className="clickable"
                    onClick={() => selectBook(book)}
                  >
                    <td>{book.title}</td>
                    <td>{book.author}</td>
                    <td>{book.status}</td>
                    <td>{book.rating || ""}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="muted">
                    Bez dat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>
      </section>

      <section className="two-col">
        <article className="card">
          <h2>Citaty ku knihe</h2>
          <p className="muted">
            {selectedBook
              ? `Vybrana kniha: ${selectedBook.title} (${selectedBook.author || "bez autora"})`
              : "Najprv vyber knihu z tabulky."}
          </p>

          <label>Citat *</label>
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
            onChange={(event) =>
              setQuoteForm((prev) => ({ ...prev, context: event.target.value }))
            }
          />

          <div className="row mt">
            <button type="button" className="btn primary" onClick={saveQuote}>
              Ulozit citat
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setQuoteForm({ id: "", quote: "", page: "", context: "", tags: "" })}
            >
              Vycistit
            </button>
          </div>

          {quoteMessage ? (
            <p className={quoteMessage.ok ? "message-ok" : "message-error"}>
              {quoteMessage.text}
            </p>
          ) : null}
        </article>

        <article className="card">
          <h2>Zoznam citatov</h2>
          <table>
            <thead>
              <tr>
                <th>Citat</th>
                <th>Strana</th>
                <th>Tagy</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {selectedQuotes.length ? (
                selectedQuotes.map((quote) => (
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
                      <button
                        type="button"
                        className="btn danger compact"
                        onClick={() => removeQuote(quote.id)}
                      >
                        X
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="muted">
                    Bez citatov.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>
      </section>

      <section className="card">
        <h2>Statistiky</h2>
        <div className="two-col">
          <div>
            <p className="muted">Knihy podla roku</p>
            {stats.booksPerYear.map((item) => (
              <div key={item.key} className="pair-row">
                <span>{item.key}</span>
                <span className="badge">{item.value}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="muted">Top autori</p>
            {stats.booksPerAuthor.slice(-10).map((item) => (
              <div key={item.key} className="pair-row">
                <span>{item.key}</span>
                <span className="badge">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
