import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/categories
export async function GET() {
  try {
    const cats = await db.category.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { tasks: true } },
      },
    });
    return NextResponse.json({ ok: true, data: cats });
  } catch (err) {
    console.error("[GET /api/categories] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST /api/categories
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body?.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "Name is required" },
        { status: 400 }
      );
    }
    const allowedColors = [
      "slate",
      "emerald",
      "rose",
      "amber",
      "sky",
      "violet",
    ];
    const color = allowedColors.includes(body?.color) ? body.color : "slate";

    const cat = await db.category.create({
      data: { name, color },
    });
    return NextResponse.json({ ok: true, data: cat }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/categories] error:", err);
    const msg =
      err && typeof err === "object" && "code" in err && err.code === "P2002"
        ? "A category with this name already exists"
        : "Failed to create category";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
