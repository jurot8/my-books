import { getSession } from "@/lib/auth";
import { addQuote, listQuotesByBookId } from "@/lib/sheets";
import { QuoteInput } from "@/lib/types";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const bookId = url.searchParams.get("bookId") ?? "";
    const quotes = await listQuotesByBookId(bookId);
    return NextResponse.json({ items: quotes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as QuoteInput;
    const quote = await addQuote(payload);
    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
