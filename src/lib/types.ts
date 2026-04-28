export type Book = {
  id: string;
  author: string;
  title: string;
  finishedAt: string;
  notes: string;
  status: string;
  startedAt: string;
  rating: number;
  pages: number;
  genre: string;
  publisher: string;
  isbn: string;
  language: string;
  cbdbUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type BookInput = Partial<Omit<Book, "id" | "createdAt" | "updatedAt">>;

export type Quote = {
  id: string;
  bookId: string;
  quote: string;
  page: string;
  context: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
};

export type QuoteInput = Partial<Omit<Quote, "id" | "createdAt" | "updatedAt">>;

export type StatsPair = {
  key: string;
  value: number;
};

export type Stats = {
  totalBooks: number;
  readBooks: number;
  totalQuotes: number;
  totalPages: number;
  avgRating: number;
  readThisYear: number;
  averagePerYear: number;
  booksPerYear: StatsPair[];
  booksPerAuthor: StatsPair[];
  booksPerStatus: StatsPair[];
  booksPerMonthByYear: Record<string, number[]>;
};

export type BootstrapData = {
  books: Book[];
  quotes: Quote[];
  stats: Stats;
};

export type PagedBooks = {
  items: Book[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CbdbSuggestion = {
  title: string;
  author: string;
  url: string;
};

export type CbdbMetadata = {
  source: "cbdb.cz";
  inputUrl: string;
  pageTitle: string;
  description: string;
  canonicalUrl: string;
  author: string;
  isbn: string;
  pages: number;
  publisher: string;
};
