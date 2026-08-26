import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/tasks — list tasks with optional filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // pending | completed | all
    const priority = searchParams.get("priority"); // low | medium | high | all
    const categoryId = searchParams.get("categoryId"); // <id> | none | all
    const q = searchParams.get("q"); // search in title

    const where: {
      status?: string;
      priority?: string;
      categoryId?: string | null;
      OR?: Array<{
        title?: { contains: string };
        description?: { contains: string };
      }>;
    } = {};

    if (status && status !== "all") where.status = status;
    if (priority && priority !== "all") where.priority = priority;
    if (categoryId && categoryId !== "all") {
      where.categoryId = categoryId === "none" ? null : categoryId;
    }
    if (q && q.trim().length > 0) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
      ];
    }

    const tasks = await db.task.findMany({
      where,
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: { category: true },
    });

    return NextResponse.json({ ok: true, data: tasks });
  } catch (err) {
    console.error("[GET /api/tasks] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// POST /api/tasks — create a new task
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = (body?.title ?? "").toString().trim();
    if (!title) {
      return NextResponse.json(
        { ok: false, error: "Title is required" },
        { status: 400 }
      );
    }

    const priority = ["low", "medium", "high"].includes(body?.priority)
      ? body.priority
      : "medium";

    const description = body?.description?.toString().trim() || null;
    const dueDate = body?.dueDate ? new Date(body.dueDate) : null;
    if (dueDate && isNaN(dueDate.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Invalid dueDate" },
        { status: 400 }
      );
    }

    let categoryId: string | null = null;
    if (typeof body.categoryId === "string" && body.categoryId.trim()) {
      // verify category exists
      const cat = await db.category.findUnique({
        where: { id: body.categoryId },
      });
      if (cat) categoryId = cat.id;
    }

    // place new task at the end (max order + 1) for its status bucket
    const maxOrder = await db.task.aggregate({
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const task = await db.task.create({
      data: {
        title,
        description,
        priority,
        status: "pending",
        dueDate,
        order: nextOrder,
        categoryId,
      },
      include: { category: true },
    });

    return NextResponse.json({ ok: true, data: task }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/tasks] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to create task" },
      { status: 500 }
    );
  }
}
