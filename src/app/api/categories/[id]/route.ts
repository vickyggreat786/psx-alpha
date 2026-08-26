import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/categories/[id]
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const n = body.name.trim();
      if (!n) {
        return NextResponse.json(
          { ok: false, error: "Name cannot be empty" },
          { status: 400 }
        );
      }
      data.name = n;
    }
    const allowedColors = [
      "slate",
      "emerald",
      "rose",
      "amber",
      "sky",
      "violet",
    ];
    if (body.color && allowedColors.includes(body.color)) {
      data.color = body.color;
    }

    const updated = await db.category.update({ where: { id }, data });
    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    console.error("[PATCH /api/categories/:id] error:", err);
    const msg =
      err && typeof err === "object" && "code" in err && err.code === "P2002"
        ? "A category with this name already exists"
        : "Failed to update category";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/categories/[id]
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await db.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/categories/:id] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to delete category" },
      { status: 500 }
    );
  }
}
