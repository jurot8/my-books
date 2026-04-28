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
  totalQuotes: number;
  totalPages: number;
  avgRating: number;
  booksPerYear: StatsPair[];
  booksPerAuthor: StatsPair[];
  booksPerStatus: StatsPair[];
};

export type BootstrapData = {
  books: Book[];
  quotes: Quote[];
  stats: Stats;
};
