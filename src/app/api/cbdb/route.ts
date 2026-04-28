import { getSession } from "@/lib/auth";
import { fetchCbdbMetadata, searchCbdb } from "@/lib/cbdb";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const mode = (url.searchParams.get("mode") ?? "metadata").trim();

  if (!query) {
    return NextResponse.json(
      { error: "Vypln nazov knihy alebo URL z cbdb.cz." },
      { status: 400 },
    );
  }

  try {
    if (mode === "search") {
      const suggestions = await searchCbdb(query);
      return NextResponse.json({ suggestions });
    }

    const metadata = await fetchCbdbMetadata(query);
    return NextResponse.json(metadata);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CBDB request failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
