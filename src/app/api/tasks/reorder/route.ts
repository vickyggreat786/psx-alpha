import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/tasks/reorder
// Body: { orderedIds: string[] }
// Re-writes the `order` field of every provided task id, in the order given.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderedIds: unknown = body?.orderedIds;

    if (
      !Array.isArray(orderedIds) ||
      !orderedIds.every((x) => typeof x === "string")
    ) {
      return NextResponse.json(
        { ok: false, error: "orderedIds must be an array of strings" },
        { status: 400 }
      );
    }

    // Use a transaction to update each task's order.
    await db.$transaction(
      orderedIds.map((id, idx) =>
        db.task.update({
          where: { id },
          data: { order: idx },
          select: { id: true },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/tasks/reorder] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to reorder tasks" },
      { status: 500 }
    );
  }
}
