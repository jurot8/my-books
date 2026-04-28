import { CbdbMetadata, CbdbSuggestion } from "@/lib/types";

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractFirstMatch(text: string, regex: RegExp): string {
  const match = text.match(regex);
  if (!match || match.length < 2) {
    return "";
  }

  return decodeHtml(match[1]?.trim() ?? "");
}

function toAbsoluteCbdbUrl(value: string): string {
  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    return `https://www.cbdb.cz${value}`;
  }

  return `https://www.cbdb.cz/${value}`;
}

function normalizeHref(value: string): string {
  return decodeHtml(value.trim());
}

function parseJsonLd(html: string): Record<string, unknown>[] {
  const matches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const output: Record<string, unknown>[] = [];

  for (const match of matches) {
    const raw = (match[1] ?? "").trim();
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") {
            output.push(item as Record<string, unknown>);
          }
        }
      } else if (parsed && typeof parsed === "object") {
        output.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Ignore malformed blocks.
    }
  }

  return output;
}

function sanitizeBookTitle(value: string): string {
  return value
    .replace(/\s*\|\s*CBDB\.cz.*$/i, "")
    .replace(/\s*-\s*CBDB\.cz.*$/i, "")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export async function searchCbdb(query: string): Promise<CbdbSuggestion[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) {
    return [];
  }

  const url = `https://www.cbdb.cz/hledat?text=${encodeURIComponent(cleanQuery)}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`CBDB search failed with ${response.status}.`);
  }

  const html = await response.text();
  const suggestions: CbdbSuggestion[] = [];
  const seen = new Set<string>();
  const regex = /<a[^>]+href="([^"]*kniha[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(regex)) {
    const relativeUrl = normalizeHref(match[1] ?? "");
    const title = decodeHtml((match[2] ?? "").replace(/<[^>]+>/g, "").trim());
    if (!relativeUrl || !title || /cbdb/i.test(title)) {
      continue;
    }

    const fullUrl = toAbsoluteCbdbUrl(relativeUrl);
    if (seen.has(fullUrl)) {
      continue;
    }

    seen.add(fullUrl);
    suggestions.push({
      title,
      author: "",
      url: fullUrl,
    });

    if (suggestions.length >= 10) {
      break;
    }
  }

  if (suggestions.length === 0) {
    const fallbackRegex = /"(\/kniha-[^"]+)"/gi;
    for (const match of html.matchAll(fallbackRegex)) {
      const fullUrl = toAbsoluteCbdbUrl(normalizeHref(match[1] ?? ""));
      if (!fullUrl || seen.has(fullUrl)) {
        continue;
      }

      seen.add(fullUrl);
      suggestions.push({
        title: cleanQuery,
        author: "",
        url: fullUrl,
      });

      if (suggestions.length >= 5) {
        break;
      }
    }
  }

  return suggestions;
}

export async function fetchCbdbMetadata(queryOrUrl: string): Promise<CbdbMetadata> {
  const query = queryOrUrl.trim();
  if (!query) {
    throw new Error("Vypln nazov knihy alebo URL z cbdb.cz.");
  }

  let targetUrl = query;
  if (!query.startsWith("http://") && !query.startsWith("https://")) {
    const suggestions = await searchCbdb(query);
    if (suggestions.length > 0) {
      targetUrl = suggestions[0].url;
    } else {
      throw new Error("Knihu sa nepodarilo najst na cbdb.cz.");
    }
  }

  const response = await fetch(targetUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`CBDB request failed with ${response.status}.`);
  }

  const html = await response.text();
  const titleTag = extractFirstMatch(html, /<title>(.*?)<\/title>/i);
  const ogTitle = extractFirstMatch(html, /<meta\s+property="og:title"\s+content="(.*?)"/i);
  const descriptionTag = extractFirstMatch(html, /<meta\s+name="description"\s+content="(.*?)"/i);
  const ogDescription = extractFirstMatch(
    html,
    /<meta\s+property="og:description"\s+content="(.*?)"/i,
  );
  const canonicalUrl = extractFirstMatch(html, /<link\s+rel="canonical"\s+href="(.*?)"/i);
  const isbn = extractFirstMatch(html, /ISBN(?:-13)?:\s*([0-9Xx\-]+)/i);
  const pagesText = extractFirstMatch(html, /(\d+)\s*stran/i);
  const publisher = extractFirstMatch(
    html,
    /(?:Nakladatel(?:stvi)?|Vydavatel(?:stvo)?):\s*<\/[^>]+>\s*<[^>]+>([^<]+)/i,
  );

  const graph = parseJsonLd(html);
  const bookNode = graph.find((node) => {
    const type = node["@type"];
    if (Array.isArray(type)) {
      return type.includes("Book");
    }
    return type === "Book";
  });

  const jsonTitle = typeof bookNode?.name === "string" ? decodeHtml(bookNode.name) : "";
  const authorValue = bookNode?.author;
  const jsonAuthor =
    typeof authorValue === "string"
      ? decodeHtml(authorValue)
      : Array.isArray(authorValue) && authorValue[0] && typeof authorValue[0] === "object"
        ? decodeHtml(String((authorValue[0] as Record<string, unknown>).name ?? ""))
        : typeof authorValue === "object" && authorValue
          ? decodeHtml(String((authorValue as Record<string, unknown>).name ?? ""))
          : "";
  const jsonPages = Number(
    typeof bookNode?.numberOfPages === "string" || typeof bookNode?.numberOfPages === "number"
      ? bookNode.numberOfPages
      : 0,
  );
  const jsonIsbn =
    typeof bookNode?.isbn === "string" ? decodeHtml(bookNode.isbn) : "";
  const jsonPublisher =
    typeof bookNode?.publisher === "object" && bookNode.publisher
      ? decodeHtml(String((bookNode.publisher as Record<string, unknown>).name ?? ""))
      : typeof bookNode?.publisher === "string"
        ? decodeHtml(bookNode.publisher)
        : "";

  return {
    source: "cbdb.cz",
    inputUrl: targetUrl,
    pageTitle: sanitizeBookTitle(jsonTitle || ogTitle || titleTag || ""),
    description: ogDescription || descriptionTag || "",
    canonicalUrl: toAbsoluteCbdbUrl(canonicalUrl || targetUrl),
    author: jsonAuthor,
    isbn: jsonIsbn || isbn,
    pages: Number.isFinite(jsonPages) && jsonPages > 0 ? jsonPages : Number(pagesText) || 0,
    publisher: jsonPublisher || publisher,
  };
}

export type CbdbSeriesBook = {
  title: string;
  order: number;
  url: string;
};

export type CbdbSeriesData = {
  seriesName: string;
  books: CbdbSeriesBook[];
};

function extractCbdbSeriesName(html: string): string {
  const fromHeading = extractFirstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (fromHeading) {
    return stripTags(fromHeading).replace(/^Seznam a pořadí knih v sérii\s*/i, "").trim();
  }

  const title = extractFirstMatch(html, /<title>(.*?)<\/title>/i);
  return stripTags(title).replace(/\s*\|\s*ČBDB\.cz.*$/i, "").trim();
}

export async function fetchCbdbSeriesFromBookUrl(bookUrl: string): Promise<CbdbSeriesData | null> {
  const cleanBookUrl = bookUrl.trim();
  if (!cleanBookUrl) {
    return null;
  }

  const bookResponse = await fetch(cleanBookUrl, { method: "GET" });
  if (!bookResponse.ok) {
    throw new Error(`CBDB request failed with ${bookResponse.status}.`);
  }

  const bookHtml = await bookResponse.text();
  const seriesPath = extractFirstMatch(
    bookHtml,
    /href="([^"]*knizni-serie-[^"]*)"/i,
  );
  if (!seriesPath) {
    return null;
  }

  const seriesUrl = toAbsoluteCbdbUrl(normalizeHref(seriesPath));
  const seriesResponse = await fetch(seriesUrl, { method: "GET" });
  if (!seriesResponse.ok) {
    throw new Error(`CBDB series request failed with ${seriesResponse.status}.`);
  }

  const seriesHtml = await seriesResponse.text();
  const seriesName = extractCbdbSeriesName(seriesHtml);
  const books: CbdbSeriesBook[] = [];
  const seenOrders = new Set<number>();
  const itemRegex =
    /<a[^>]+href="([^"]*kniha-[^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,260}?\((\d+)\.\s*díl\)/gi;

  for (const match of seriesHtml.matchAll(itemRegex)) {
    const href = normalizeHref(match[1] ?? "");
    const title = stripTags(match[2] ?? "");
    const order = Number(match[3]);
    if (!href || !title || !Number.isFinite(order) || seenOrders.has(order)) {
      continue;
    }

    seenOrders.add(order);
    books.push({
      title,
      order,
      url: toAbsoluteCbdbUrl(href),
    });
  }

  books.sort((a, b) => a.order - b.order);
  if (!books.length) {
    return null;
  }

  return {
    seriesName,
    books,
  };
}
