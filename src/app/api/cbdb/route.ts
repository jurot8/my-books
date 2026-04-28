import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

function extractFirstMatch(text: string, regex: RegExp): string {
  const match = text.match(regex);
  if (!match || match.length < 2) {
    return "";
  }

  return match[1]?.trim() ?? "";
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (!query) {
    return NextResponse.json(
      { error: "Vypln nazov knihy alebo URL z cbdb.cz." },
      { status: 400 },
    );
  }

  const targetUrl = query.startsWith("http")
    ? query
    : `https://www.cbdb.cz/hledat?text=${encodeURIComponent(query)}`;

  const response = await fetch(targetUrl, { method: "GET" });
  if (!response.ok) {
    return NextResponse.json(
      { error: `CBDB request failed with ${response.status}.` },
      { status: 400 },
    );
  }

  const html = await response.text();
  const title = extractFirstMatch(html, /<title>(.*?)<\/title>/i);
  const ogTitle = extractFirstMatch(
    html,
    /<meta\s+property="og:title"\s+content="(.*?)"/i,
  );
  const description = extractFirstMatch(
    html,
    /<meta\s+name="description"\s+content="(.*?)"/i,
  );
  const ogDescription = extractFirstMatch(
    html,
    /<meta\s+property="og:description"\s+content="(.*?)"/i,
  );
  const canonicalUrl = extractFirstMatch(
    html,
    /<link\s+rel="canonical"\s+href="(.*?)"/i,
  );

  return NextResponse.json({
    source: "cbdb.cz",
    inputUrl: targetUrl,
    pageTitle: decodeHtml(ogTitle || title || ""),
    description: decodeHtml(ogDescription || description || ""),
    canonicalUrl: canonicalUrl || targetUrl,
  });
}
