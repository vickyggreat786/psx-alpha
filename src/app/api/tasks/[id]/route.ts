import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/tasks/[id] — update fields
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) {
        return NextResponse.json(
          { ok: false, error: "Title cannot be empty" },
          { status: 400 }
        );
      }
      data.title = t;
    }
    if (typeof body.description === "string") {
      data.description = body.description.trim() || null;
    }
    if (body.priority && ["low", "medium", "high"].includes(body.priority)) {
      data.priority = body.priority;
    }
    if (body.status && ["pending", "completed"].includes(body.status)) {
      data.status = body.status;
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate === null) {
        data.dueDate = null;
      } else {
        const d = new Date(body.dueDate);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { ok: false, error: "Invalid dueDate" },
            { status: 400 }
          );
        }
        data.dueDate = d;
      }
    }
    if (body.categoryId !== undefined) {
      if (body.categoryId === null || body.categoryId === "") {
        data.categoryId = null;
      } else if (typeof body.categoryId === "string") {
        const cat = await db.category.findUnique({
          where: { id: body.categoryId },
        });
        if (!cat) {
          return NextResponse.json(
            { ok: false, error: "Category not found" },
            { status: 400 }
          );
        }
        data.categoryId = cat.id;
      }
    }
    if (typeof body.order === "number") {
      data.order = body.order;
    }

    const updated = await db.task.update({
      where: { id },
      data,
      include: { category: true },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    console.error("[PATCH /api/tasks/:id] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to update task" },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id]
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/tasks/:id] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
