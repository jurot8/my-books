import { getSession } from "@/lib/auth";
import { fetchCbdbMetadata } from "@/lib/cbdb";
import { enrichBookFromMetadata, getBookById } from "@/lib/sheets";
import { NextResponse } from "next/server";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: Context) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const book = await getBookById(id);
    const metadata = await fetchCbdbMetadata(book.cbdbUrl || book.title);
    const updated = await enrichBookFromMetadata(id, metadata);
    return NextResponse.json({ book: updated, metadata });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
