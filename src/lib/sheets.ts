import { google, sheets_v4 } from "googleapis";
import { randomUUID } from "crypto";
import { Book, BookInput, BootstrapData, PagedBooks, Quote, QuoteInput, Stats } from "@/lib/types";

const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "";
const booksSheetName = process.env.GOOGLE_SHEETS_BOOKS_SHEET ?? "Zoznam";
const booksStartRow = Number(process.env.GOOGLE_SHEETS_BOOKS_START_ROW ?? "4");
const quotesSheetName = process.env.GOOGLE_SHEETS_QUOTES_SHEET ?? "Quotes";
const metaSheetName = process.env.GOOGLE_SHEETS_META_SHEET ?? "BookMeta";

const quoteColumns = [
  "id",
  "bookId",
  "quote",
  "page",
  "context",
  "tags",
  "createdAt",
  "updatedAt",
] as const;

const metaColumns = [
  "bookId",
  "status",
  "startedAt",
  "rating",
  "pages",
  "genre",
  "publisher",
  "isbn",
  "language",
  "cbdbUrl",
  "updatedAt",
  "createdAt",
] as const;

type RowMap = Record<string, string | number>;

type ParsedDate = {
  year: string;
  monthIndex: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}.`);
  }

  return value;
}

function getSheetsClient(): sheets_v4.Sheets {
  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEETS_SPREADSHEET_ID.");
  }

  const auth = new google.auth.JWT({
    email: requiredEnv("GOOGLE_CLIENT_EMAIL"),
    key: requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({
    version: "v4",
    auth,
  });
}

function toColumnLetter(columnNumber: number): string {
  let n = columnNumber;
  let letter = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - mod) / 26);
  }
  return letter;
}

function sanitizeString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractYear(value: string): string {
  const text = sanitizeString(value);
  const byPrefix = text.match(/^(\d{4})/);
  if (byPrefix) {
    return byPrefix[1];
  }

  const bySuffix = text.match(/(\d{4})$/);
  if (bySuffix) {
    return bySuffix[1];
  }

  return "";
}

function parseDate(value: string): ParsedDate | null {
  const text = sanitizeString(value);
  if (!text) {
    return null;
  }

  const fullMatch = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (fullMatch) {
    const month = Number(fullMatch[2]);
    if (month >= 1 && month <= 12) {
      return {
        year: fullMatch[3],
        monthIndex: month - 1,
      };
    }
  }

  const year = extractYear(text);
  if (year) {
    return {
      year,
      monthIndex: -1,
    };
  }

  return null;
}

function toSortedPairs(source: Record<string, number>) {
  return Object.keys(source)
    .sort()
    .map((key) => ({
      key,
      value: source[key],
    }));
}

function computeStats(books: Book[], quotes: Quote[]): Stats {
  const readBooks = books.filter((book) => Boolean(sanitizeString(book.finishedAt)));
  const ratedBooks = readBooks.filter((book) => normalizeNumber(book.rating) > 0);
  const byYear: Record<string, number> = {};
  const byAuthor: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byMonthByYear: Record<string, number[]> = {};
  let totalPages = 0;

  for (const book of readBooks) {
    const parsedDate = parseDate(book.finishedAt);
    const year = parsedDate?.year ?? "Nezadane";
    byYear[year] = (byYear[year] ?? 0) + 1;
    byMonthByYear[year] = byMonthByYear[year] ?? Array(12).fill(0);
    if (parsedDate && parsedDate.monthIndex >= 0) {
      byMonthByYear[year][parsedDate.monthIndex] += 1;
    }

    const author = sanitizeString(book.author) || "Neznamy autor";
    byAuthor[author] = (byAuthor[author] ?? 0) + 1;

    const status = sanitizeString(book.status) || "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    totalPages += normalizeNumber(book.pages);
  }

  const avgRating = ratedBooks.length
    ? ratedBooks.reduce((sum, book) => sum + normalizeNumber(book.rating), 0) /
      ratedBooks.length
    : 0;

  const currentYear = String(new Date().getFullYear());
  const yearsForAverage = Object.keys(byYear).filter((year) => /^\d{4}$/.test(year));
  const yearlyAverage = yearsForAverage.length
    ? yearsForAverage.reduce((sum, year) => sum + byYear[year], 0) / yearsForAverage.length
    : 0;

  return {
    totalBooks: books.length,
    readBooks: readBooks.length,
    totalQuotes: quotes.length,
    totalPages,
    avgRating: Number(avgRating.toFixed(2)),
    readThisYear: byYear[currentYear] ?? 0,
    averagePerYear: Number(yearlyAverage.toFixed(2)),
    booksPerYear: toSortedPairs(byYear),
    booksPerAuthor: toSortedPairs(byAuthor),
    booksPerStatus: toSortedPairs(byStatus),
    booksPerMonthByYear: byMonthByYear,
  };
}

async function getSheetIdByTitle(
  sheets: sheets_v4.Sheets,
  sheetTitle: string,
): Promise<number | null> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });

  const match = response.data.sheets?.find(
    (sheet) => sheet.properties?.title === sheetTitle,
  );

  return match?.properties?.sheetId ?? null;
}

async function ensureSheetWithHeader(
  sheets: sheets_v4.Sheets,
  sheetTitle: string,
  headers: readonly string[],
): Promise<void> {
  const existingSheetId = await getSheetIdByTitle(sheets, sheetTitle);
  if (existingSheetId === null) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetTitle } } }],
      },
    });
  }

  const endColumn = toColumnLetter(headers.length);
  const range = `'${sheetTitle}'!A1:${endColumn}1`;
  const currentHeader = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const existing = (currentHeader.data.values?.[0] ?? []).map(sanitizeString);
  const shouldRewrite = headers.some((header, index) => existing[index] !== header);
  if (!shouldRewrite) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: {
      values: [Array.from(headers)],
    },
  });
}

async function ensureSchema(): Promise<void> {
  const sheets = getSheetsClient();
  await ensureSheetWithHeader(sheets, quotesSheetName, quoteColumns);
  await ensureSheetWithHeader(sheets, metaSheetName, metaColumns);
}

async function readRowsByHeader(
  sheetTitle: string,
  headers: readonly string[],
): Promise<RowMap[]> {
  const sheets = getSheetsClient();
  const endColumn = toColumnLetter(headers.length);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetTitle}'!A2:${endColumn}`,
  });

  const rows = response.data.values ?? [];
  return rows.map((row) =>
    headers.reduce<RowMap>((acc, header, index) => {
      acc[header] = row[index] ?? "";
      return acc;
    }, {}),
  );
}

async function readBookMetaMap(): Promise<Record<string, RowMap>> {
  const metaRows = await readRowsByHeader(metaSheetName, metaColumns);
  return metaRows.reduce<Record<string, RowMap>>((acc, row) => {
    const key = sanitizeString(row.bookId);
    if (key) {
      acc[key] = row;
    }
    return acc;
  }, {});
}

function bookIdFromRow(rowNumber: number): string {
  return `r${rowNumber}`;
}

function rowFromBookId(bookId: string): number {
  const match = sanitizeString(bookId).match(/^r(\d+)$/);
  if (!match) {
    throw new Error(`Invalid book ID ${bookId}.`);
  }
  return Number(match[1]);
}

async function readBooks(): Promise<Book[]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [`'${booksSheetName}'!A${booksStartRow}:D`],
    includeGridData: true,
    fields:
      "sheets(data(rowData(values(formattedValue,hyperlink,userEnteredValue.formulaValue))))",
  });

  const rows = response.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const metaMap = await readBookMetaMap();

  return rows
    .map((row, index): Book => {
      const rowNumber = booksStartRow + index;
      const id = bookIdFromRow(rowNumber);
      const meta = metaMap[id] ?? {};
      const values = row.values ?? [];

      const author = sanitizeString(values[0]?.formattedValue ?? "");
      const title = sanitizeString(values[1]?.formattedValue ?? "");
      const finishedAt = sanitizeString(values[2]?.formattedValue ?? "");
      const notes = sanitizeString(values[3]?.formattedValue ?? "");

      const titleHyperlink = sanitizeString(values[1]?.hyperlink ?? "");
      const titleFormula = sanitizeString(values[1]?.userEnteredValue?.formulaValue ?? "");
      const richTextLink = sanitizeString(values[1]?.textFormatRuns?.[0]?.format?.link?.uri ?? "");
      const formulaLinkMatch = titleFormula.match(/HYPERLINK\(\s*"([^"]+)"/i);
      const cbdbFromTitleCell =
        titleHyperlink || richTextLink || sanitizeString(formulaLinkMatch?.[1]);
      const cbdbFromMeta = sanitizeString(meta.cbdbUrl);

      return {
        id,
        author,
        title,
        finishedAt,
        notes,
        status: sanitizeString(meta.status) || "read",
        startedAt: sanitizeString(meta.startedAt),
        rating: normalizeNumber(meta.rating),
        pages: normalizeNumber(meta.pages),
        genre: sanitizeString(meta.genre),
        publisher: sanitizeString(meta.publisher),
        isbn: sanitizeString(meta.isbn),
        language: sanitizeString(meta.language),
        cbdbUrl: cbdbFromMeta || cbdbFromTitleCell,
        updatedAt: sanitizeString(meta.updatedAt),
        createdAt: sanitizeString(meta.createdAt),
      };
    })
    .filter((book) => Boolean(book.title || book.author));
}

function sortBooksByDateDesc(books: Book[]): Book[] {
  return [...books].sort((a, b) => {
    const yearA = Number(extractYear(a.finishedAt) || "0");
    const yearB = Number(extractYear(b.finishedAt) || "0");
    if (yearA !== yearB) {
      return yearB - yearA;
    }

    return b.id.localeCompare(a.id);
  });
}

async function readQuotes(): Promise<Quote[]> {
  const rows = await readRowsByHeader(quotesSheetName, quoteColumns);
  return rows.map((row) => ({
    id: sanitizeString(row.id),
    bookId: sanitizeString(row.bookId),
    quote: sanitizeString(row.quote),
    page: sanitizeString(row.page),
    context: sanitizeString(row.context),
    tags: sanitizeString(row.tags),
    createdAt: sanitizeString(row.createdAt),
    updatedAt: sanitizeString(row.updatedAt),
  }));
}

async function findMetaRow(bookId: string): Promise<{ rowNumber: number; data: RowMap } | null> {
  const rows = await readRowsByHeader(metaSheetName, metaColumns);
  const index = rows.findIndex((row) => sanitizeString(row.bookId) === bookId);
  if (index < 0) {
    return null;
  }

  return {
    rowNumber: index + 2,
    data: rows[index],
  };
}

async function upsertBookMeta(bookId: string, input: BookInput): Promise<void> {
  const writableFields: (keyof BookInput)[] = [
    "status",
    "startedAt",
    "rating",
    "pages",
    "genre",
    "publisher",
    "isbn",
    "language",
    "cbdbUrl",
  ];

  const payload: RowMap = {};
  for (const field of writableFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      payload[field] =
        field === "rating" || field === "pages"
          ? normalizeNumber(input[field])
          : sanitizeString(input[field]);
    }
  }

  if (Object.keys(payload).length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const sheets = getSheetsClient();
  const existing = await findMetaRow(bookId);

  if (!existing) {
    const row = [
      bookId,
      sanitizeString(payload.status) || "read",
      sanitizeString(payload.startedAt),
      normalizeNumber(payload.rating),
      normalizeNumber(payload.pages),
      sanitizeString(payload.genre),
      sanitizeString(payload.publisher),
      sanitizeString(payload.isbn),
      sanitizeString(payload.language),
      sanitizeString(payload.cbdbUrl),
      now,
      now,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${metaSheetName}'!A:A`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
    return;
  }

  const updated: RowMap = { ...existing.data };
  for (const field of writableFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      updated[field] = payload[field] ?? "";
    }
  }

  updated.updatedAt = now;
  const endColumn = toColumnLetter(metaColumns.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${metaSheetName}'!A${existing.rowNumber}:${endColumn}${existing.rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        metaColumns.map((column) => {
          const value = updated[column];
          return value ?? "";
        }),
      ],
    },
  });
}

export async function getBookById(bookId: string): Promise<Book> {
  const books = await readBooks();
  const found = books.find((book) => book.id === bookId);
  if (!found) {
    throw new Error(`Book ${bookId} was not found.`);
  }

  return found;
}

function extractRowNumberFromRange(range?: string | null): number | null {
  if (!range) {
    return null;
  }

  const match = range.match(/![A-Z]+(\d+):[A-Z]+(\d+)/);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function escapeFormulaText(value: string): string {
  return sanitizeString(value).replace(/"/g, '""');
}

function toBookTitleCellValue(title: string, cbdbUrl: string): string {
  const cleanTitle = sanitizeString(title);
  const cleanUrl = sanitizeString(cbdbUrl);
  if (!cleanTitle) {
    return "";
  }

  if (!cleanUrl) {
    return cleanTitle;
  }

  return `=HYPERLINK("${escapeFormulaText(cleanUrl)}","${escapeFormulaText(cleanTitle)}")`;
}

export async function getBootstrapData(): Promise<BootstrapData> {
  await ensureSchema();
  const books = await readBooks();
  const quotes = await readQuotes();

  return {
    books,
    quotes,
    stats: computeStats(books, quotes),
  };
}

export async function getStatsData(): Promise<Stats> {
  await ensureSchema();
  const books = await readBooks();
  const quotes = await readQuotes();
  return computeStats(books, quotes);
}

export async function listBooksPage(
  page: number,
  pageSize: number,
  filter: string,
): Promise<PagedBooks> {
  await ensureSchema();
  const books = sortBooksByDateDesc(await readBooks());
  const cleanFilter = sanitizeString(filter).toLowerCase();
  const filtered = cleanFilter
    ? books.filter((book) => {
        const title = sanitizeString(book.title).toLowerCase();
        const author = sanitizeString(book.author).toLowerCase();
        return title.includes(cleanFilter) || author.includes(cleanFilter);
      })
    : books;

  const safePageSize = Math.min(100, Math.max(5, pageSize || 25));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(totalPages, Math.max(1, page || 1));
  const start = (safePage - 1) * safePageSize;
  const items = filtered.slice(start, start + safePageSize);

  return {
    items,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export async function listQuotesByBookId(bookId: string): Promise<Quote[]> {
  await ensureSchema();
  const cleanBookId = sanitizeString(bookId);
  if (!cleanBookId) {
    return [];
  }

  const quotes = await readQuotes();
  return quotes.filter((quote) => sanitizeString(quote.bookId) === cleanBookId);
}

export async function addBook(input: BookInput): Promise<Book> {
  await ensureSchema();
  if (!sanitizeString(input.title)) {
    throw new Error("Nazov knihy je povinny.");
  }

  const sheets = getSheetsClient();
  const row = [
    sanitizeString(input.author),
    toBookTitleCellValue(sanitizeString(input.title), sanitizeString(input.cbdbUrl)),
    sanitizeString(input.finishedAt),
    sanitizeString(input.notes),
  ];

  const appendResult = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${booksSheetName}'!A:D`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row],
    },
  });

  const rowNumber =
    extractRowNumberFromRange(appendResult.data.updates?.updatedRange) ??
    booksStartRow;
  const id = bookIdFromRow(rowNumber);

  await upsertBookMeta(id, input);
  return getBookById(id);
}

export async function updateBook(bookId: string, patch: BookInput): Promise<Book> {
  await ensureSchema();
  const rowNumber = rowFromBookId(bookId);
  const sheets = getSheetsClient();

  const currentBook = await getBookById(bookId);
  const nextAuthor = Object.prototype.hasOwnProperty.call(patch, "author")
    ? sanitizeString(patch.author)
    : currentBook.author;
  const nextTitle = Object.prototype.hasOwnProperty.call(patch, "title")
    ? sanitizeString(patch.title)
    : currentBook.title;
  const nextDate = Object.prototype.hasOwnProperty.call(patch, "finishedAt")
    ? sanitizeString(patch.finishedAt)
    : currentBook.finishedAt;
  const nextNotes = Object.prototype.hasOwnProperty.call(patch, "notes")
    ? sanitizeString(patch.notes)
    : currentBook.notes;
  const nextCbdbUrl = Object.prototype.hasOwnProperty.call(patch, "cbdbUrl")
    ? sanitizeString(patch.cbdbUrl)
    : currentBook.cbdbUrl;

  const updated = [
    nextAuthor,
    toBookTitleCellValue(nextTitle, nextCbdbUrl),
    nextDate,
    nextNotes,
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${booksSheetName}'!A${rowNumber}:D${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [updated],
    },
  });

  await upsertBookMeta(bookId, patch);
  return getBookById(bookId);
}

export async function enrichBookFromMetadata(
  bookId: string,
  metadata: {
    canonicalUrl?: string;
    author?: string;
    isbn?: string;
    pages?: number;
    publisher?: string;
    description?: string;
  },
): Promise<Book> {
  const book = await getBookById(bookId);
  const patch: BookInput = {};

  if (!book.cbdbUrl && sanitizeString(metadata.canonicalUrl)) {
    patch.cbdbUrl = sanitizeString(metadata.canonicalUrl);
  }
  if (!book.author && sanitizeString(metadata.author)) {
    patch.author = sanitizeString(metadata.author);
  }
  if (!book.isbn && sanitizeString(metadata.isbn)) {
    patch.isbn = sanitizeString(metadata.isbn);
  }
  if (!book.pages && normalizeNumber(metadata.pages) > 0) {
    patch.pages = normalizeNumber(metadata.pages);
  }
  if (!book.publisher && sanitizeString(metadata.publisher)) {
    patch.publisher = sanitizeString(metadata.publisher);
  }
  if (!book.notes && sanitizeString(metadata.description)) {
    patch.notes = sanitizeString(metadata.description);
  }

  if (Object.keys(patch).length === 0) {
    return book;
  }

  return updateBook(bookId, patch);
}

export async function addQuote(input: QuoteInput): Promise<Quote> {
  await ensureSchema();

  const bookId = sanitizeString(input.bookId);
  if (!bookId) {
    throw new Error("bookId je povinne.");
  }

  if (!sanitizeString(input.quote)) {
    throw new Error("Citat je povinny.");
  }

  await getBookById(bookId);

  const now = new Date().toISOString();
  const quote: Quote = {
    id: randomUUID(),
    bookId,
    quote: sanitizeString(input.quote),
    page: sanitizeString(input.page),
    context: sanitizeString(input.context),
    tags: sanitizeString(input.tags),
    createdAt: now,
    updatedAt: now,
  };

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${quotesSheetName}'!A:A`,
    valueInputOption: "RAW",
    requestBody: {
      values: [quoteColumns.map((column) => quote[column])],
    },
  });

  return quote;
}

async function findQuoteRow(
  quoteId: string,
): Promise<{ rowNumber: number; data: Quote } | null> {
  const quotes = await readQuotes();
  const index = quotes.findIndex((quote) => quote.id === quoteId);
  if (index < 0) {
    return null;
  }

  return {
    rowNumber: index + 2,
    data: quotes[index],
  };
}

export async function updateQuote(quoteId: string, patch: QuoteInput): Promise<Quote> {
  await ensureSchema();
  const existing = await findQuoteRow(quoteId);
  if (!existing) {
    throw new Error(`Quote ${quoteId} was not found.`);
  }

  if (patch.bookId) {
    await getBookById(patch.bookId);
  }

  const updated: Quote = {
    ...existing.data,
    bookId: Object.prototype.hasOwnProperty.call(patch, "bookId")
      ? sanitizeString(patch.bookId)
      : existing.data.bookId,
    quote: Object.prototype.hasOwnProperty.call(patch, "quote")
      ? sanitizeString(patch.quote)
      : existing.data.quote,
    page: Object.prototype.hasOwnProperty.call(patch, "page")
      ? sanitizeString(patch.page)
      : existing.data.page,
    context: Object.prototype.hasOwnProperty.call(patch, "context")
      ? sanitizeString(patch.context)
      : existing.data.context,
    tags: Object.prototype.hasOwnProperty.call(patch, "tags")
      ? sanitizeString(patch.tags)
      : existing.data.tags,
    updatedAt: new Date().toISOString(),
  };

  const sheets = getSheetsClient();
  const endColumn = toColumnLetter(quoteColumns.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${quotesSheetName}'!A${existing.rowNumber}:${endColumn}${existing.rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [quoteColumns.map((column) => updated[column])],
    },
  });

  return updated;
}

export async function deleteQuote(quoteId: string): Promise<void> {
  await ensureSchema();
  const existing = await findQuoteRow(quoteId);
  if (!existing) {
    throw new Error(`Quote ${quoteId} was not found.`);
  }

  const sheets = getSheetsClient();
  const sheetId = await getSheetIdByTitle(sheets, quotesSheetName);
  if (sheetId === null) {
    throw new Error("Quotes sheet was not found.");
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: existing.rowNumber - 1,
              endIndex: existing.rowNumber,
            },
          },
        },
      ],
    },
  });
}
