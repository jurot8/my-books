import { getSession } from "@/lib/auth";
import { getSeriesProgress } from "@/lib/sheets";
import { NextResponse } from "next/server";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const session = await getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const series = await getSeriesProgress(id);
    return NextResponse.json({ series });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
