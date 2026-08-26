"use client";

import * as React from "react";
import {
  format,
  isPast,
  isToday,
  isTomorrow,
  parseISO,
} from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  GripVertical,
  ListTodo,
  Loader2,
  Pencil,
  Plus,
  Search,
  Tag,
  Tags,
  Trash2,
  X,
} from "lucide-react";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------- Types ----------
type Priority = "low" | "medium" | "high";
type Status = "pending" | "completed";
type CategoryColor =
  | "slate"
  | "emerald"
  | "rose"
  | "amber"
  | "sky"
  | "violet";

interface Category {
  id: string;
  name: string;
  color: CategoryColor;
  _count?: { tasks: number };
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  dueDate: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  categoryId: string | null;
  category?: Category | null;
}

// ---------- Helpers ----------
const PRIORITY_META: Record<
  Priority,
  { label: string; badge: string; dot: string }
> = {
  high: {
    label: "High",
    badge:
      "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900",
    dot: "bg-rose-500",
  },
  medium: {
    label: "Medium",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    dot: "bg-amber-500",
  },
  low: {
    label: "Low",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    dot: "bg-emerald-500",
  },
};

const CATEGORY_COLORS: Record<
  CategoryColor,
  { label: string; badge: string; dot: string }
> = {
  slate: {
    label: "Slate",
    badge:
      "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    dot: "bg-slate-500",
  },
  emerald: {
    label: "Emerald",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    dot: "bg-emerald-500",
  },
  rose: {
    label: "Rose",
    badge:
      "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-900",
    dot: "bg-rose-500",
  },
  amber: {
    label: "Amber",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    dot: "bg-amber-500",
  },
  sky: {
    label: "Sky",
    badge:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-900",
    dot: "bg-sky-500",
  },
  violet: {
    label: "Violet",
    badge:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200 dark:border-violet-900",
    dot: "bg-violet-500",
  },
};

const COLOR_KEYS: CategoryColor[] = [
  "slate",
  "emerald",
  "rose",
  "amber",
  "sky",
  "violet",
];

function formatDueDate(iso: string | null): {
  label: string;
  tone: "default" | "soon" | "overdue" | "done";
} {
  if (!iso) return { label: "", tone: "default" };
  const d = parseISO(iso);
  if (isToday(d))
    return { label: `Today · ${format(d, "MMM d")}`, tone: "soon" };
  if (isTomorrow(d))
    return { label: `Tomorrow · ${format(d, "MMM d")}`, tone: "soon" };
  if (isPast(d))
    return { label: `Overdue · ${format(d, "MMM d")}`, tone: "overdue" };
  return { label: format(d, "EEE, MMM d"), tone: "default" };
}

// ---------- Main Component ----------
export function TaskFlowView() {
  const { toast } = useToast();

  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);

  // form state
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<Priority>("medium");
  const [dueDate, setDueDate] = React.useState<string>("");
  const [categoryId, setCategoryId] = React.useState<string>("none");
  const [showDetails, setShowDetails] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // filters
  const [statusFilter, setStatusFilter] = React.useState<"all" | Status>("all");
  const [priorityFilter, setPriorityFilter] = React.useState<"all" | Priority>(
    "all"
  );
  const [categoryFilter, setCategoryFilter] = React.useState<
    "all" | "none" | string
  >("all");
  const [search, setSearch] = React.useState("");

  // dialogs
  const [editTask, setEditTask] = React.useState<Task | null>(null);
  const [deleteTask, setDeleteTask] = React.useState<Task | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // category management
  const [showCatDialog, setShowCatDialog] = React.useState(false);
  const [newCatName, setNewCatName] = React.useState("");
  const [newCatColor, setNewCatColor] = React.useState<CategoryColor>("slate");
  const [catSaving, setCatSaving] = React.useState(false);
  const [manageCat, setManageCat] = React.useState<Category | null>(null);

  // ---------- Fetch ----------
  const fetchTasks = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (categoryFilter !== "all")
        params.set("categoryId", categoryFilter); // "none" or <id>
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`/api/tasks?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.ok) {
        setTasks(json.data);
      } else {
        toast({
          title: "Failed to load tasks",
          description: json.error ?? "Unknown error",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Network error",
        description: "Could not reach server",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, categoryFilter, search, toast]);

  const fetchCategories = React.useCallback(async () => {
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setCategories(json.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  React.useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      fetchTasks();
    }, 200);
    return () => clearTimeout(t);
  }, [fetchTasks]);

  React.useEffect(() => {
    fetchTasks();
    fetchCategories();
  }, [fetchTasks, fetchCategories]);

  // ---------- Stats ----------
  const stats = React.useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const pending = total - completed;
    const high = tasks.filter(
      (t) => t.priority === "high" && t.status === "pending"
    ).length;
    return { total, completed, pending, high };
  }, [tasks]);

  // ---------- Create ----------
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          dueDate: dueDate || undefined,
          categoryId: categoryId === "none" ? undefined : categoryId,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Task added",
          description: `“${json.data.title}” created`,
        });
        setTitle("");
        setDescription("");
        setPriority("medium");
        setDueDate("");
        setCategoryId("none");
        setShowDetails(false);
        await Promise.all([fetchTasks(), fetchCategories()]);
      } else {
        toast({
          title: "Could not add task",
          description: json.error ?? "Unknown error",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Network error",
        description: "Could not reach server",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Toggle complete ----------
  async function toggleComplete(task: Task) {
    const next: Status = task.status === "completed" ? "pending" : "completed";
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t))
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      toast({
        title: next === "completed" ? "Task completed" : "Marked as pending",
        description: task.title,
      });
    } catch (e) {
      console.error(e);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
      toast({
        title: "Update failed",
        description: "Reverted change",
        variant: "destructive",
      });
    }
  }

  // ---------- Save edit ----------
  async function handleSaveEdit(data: {
    title: string;
    description: string;
    priority: Priority;
    dueDate: string;
    categoryId: string; // "none" or <id>
  }) {
    if (!editTask) return;
    try {
      const res = await fetch(`/api/tasks/${editTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          priority: data.priority,
          dueDate: data.dueDate || null,
          categoryId: data.categoryId === "none" ? null : data.categoryId,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({ title: "Task updated", description: data.title });
        setEditTask(null);
        await Promise.all([fetchTasks(), fetchCategories()]);
      } else {
        throw new Error(json.error);
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Update failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  }

  // ---------- Delete ----------
  async function handleDelete() {
    if (!deleteTask) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${deleteTask.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Task deleted",
          description: deleteTask.title,
        });
        setDeleteTask(null);
        await Promise.all([fetchTasks(), fetchCategories()]);
      } else {
        throw new Error(json.error);
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Delete failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  // ---------- Category create ----------
  async function handleCreateCategory() {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim(), color: newCatColor }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Category created",
          description: newCatName.trim(),
        });
        setNewCatName("");
        setNewCatColor("slate");
        await fetchCategories();
      } else {
        throw new Error(json.error);
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Could not create category",
        description:
          e instanceof Error ? e.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setCatSaving(false);
    }
  }

  // ---------- Category delete ----------
  async function handleDeleteCategory(cat: Category) {
    try {
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Category deleted",
          description: cat.name,
        });
        setManageCat(null);
        setCategoryFilter("all");
        await Promise.all([fetchTasks(), fetchCategories()]);
      } else {
        throw new Error(json.error);
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Delete failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  }

  // ---------- Drag & Drop ----------
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tasks, oldIndex, newIndex);
    setTasks(reordered);

    // persist new order
    try {
      const res = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((t) => t.id) }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
    } catch (e) {
      console.error(e);
      toast({
        title: "Could not save order",
        description: "Reverted to previous order",
        variant: "destructive",
      });
      // rollback by refetching
      fetchTasks();
    }
  }

  const hasFilters =
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    categoryFilter !== "all" ||
    search.trim().length > 0;

  // Only allow drag reorder when no filters are applied
  const canDrag = !hasFilters;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5">
        {/* ---------- Stats ---------- */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Total"
            value={stats.total}
            icon={<ListTodo className="h-4 w-4" />}
            tone="neutral"
          />
          <StatCard
            label="Pending"
            value={stats.pending}
            icon={<Clock className="h-4 w-4" />}
            tone="amber"
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="emerald"
          />
          <StatCard
            label="High priority"
            value={stats.high}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="rose"
          />
        </section>

        {/* ---------- Add task form ---------- */}
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Add a new task…  (press Enter)"
                  className="flex-1 h-10 text-base"
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shrink-0"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1.5" />
                  )}
                  Add
                </Button>
              </div>

              {showDetails ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Priority</Label>
                    <Select
                      value={priority}
                      onValueChange={(v) => setPriority(v as Priority)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Due date</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Category</Label>
                    <Select
                      value={categoryId}
                      onValueChange={setCategoryId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  CATEGORY_COLORS[c.color].dot
                                )}
                              />
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-3">
                    <Label className="text-xs">Description (optional)</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add notes, context, or links…"
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                  <div className="sm:col-span-3 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDetails(false)}
                      className="text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Hide details
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add details (priority, due date, category, description)
                </button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* ---------- Filters ---------- */}
        <section className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <TabsList className="bg-muted/60">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="completed">Done</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 flex-1 sm:flex-none sm:justify-end flex-wrap">
            <div className="relative flex-1 sm:w-56 min-w-[140px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="pl-8 h-9"
              />
            </div>
            <Select
              value={priorityFilter}
              onValueChange={(v) =>
                setPriorityFilter(v as typeof priorityFilter)
              }
            >
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priority</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v)}
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          CATEGORY_COLORS[c.color].dot
                        )}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setShowCatDialog(true)}
              aria-label="Manage categories"
            >
              <Tags className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* Drag hint */}
        {canDrag && tasks.length > 1 && (
          <p className="text-xs text-muted-foreground -mt-2 flex items-center gap-1.5">
            <GripVertical className="h-3 w-3" />
            Drag the handle to reorder tasks. Order is saved automatically.
          </p>
        )}

        {/* ---------- Task list ---------- */}
        <section>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-muted/40 animate-pulse"
                />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : canDrag ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={tasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <SortableTaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => toggleComplete(task)}
                      onEdit={() => setEditTask(task)}
                      onDelete={() => setDeleteTask(task)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={() => toggleComplete(task)}
                  onEdit={() => setEditTask(task)}
                  onDelete={() => setDeleteTask(task)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---------- Edit Dialog ---------- */}
      <EditTaskDialog
        task={editTask}
        categories={categories}
        onClose={() => setEditTask(null)}
        onSave={handleSaveEdit}
      />

      {/* ---------- Delete Confirm ---------- */}
      <AlertDialog
        open={!!deleteTask}
        onOpenChange={(o) => !o && setDeleteTask(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                “{deleteTask?.title}”
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- Category Manager Dialog ---------- */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage categories</DialogTitle>
            <DialogDescription>
              Create, color, and remove categories to organize your tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Create new */}
            <div className="space-y-2">
              <Label className="text-xs">New category name</Label>
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Work, Personal, Errands…"
                className="h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCatName.trim()) {
                    e.preventDefault();
                    handleCreateCategory();
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                {COLOR_KEYS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewCatColor(c)}
                    className={cn(
                      "h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
                      CATEGORY_COLORS[c].dot,
                      newCatColor === c
                        ? "ring-foreground scale-110"
                        : "ring-transparent"
                    )}
                    aria-label={`Color ${CATEGORY_COLORS[c].label}`}
                  />
                ))}
              </div>
              <Button
                onClick={handleCreateCategory}
                disabled={catSaving || !newCatName.trim()}
                className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {catSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Plus className="h-4 w-4 mr-1.5" />
                )}
                Create category
              </Button>
            </div>

            {/* Existing */}
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No categories yet. Create your first one above.
                </p>
              ) : (
                categories.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full shrink-0",
                          CATEGORY_COLORS[c.color].dot
                        )}
                      />
                      <span className="text-sm font-medium truncate">
                        {c.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 font-medium"
                      >
                        {c._count?.tasks ?? 0}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      onClick={() => setManageCat(c)}
                      aria-label={`Delete ${c.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCatDialog(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Category Delete Confirm ---------- */}
      <AlertDialog
        open={!!manageCat}
        onOpenChange={(o) => !o && setManageCat(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete{" "}
              <span className="font-medium text-foreground">
                “{manageCat?.name}”
              </span>
              . Tasks in this category will be unassigned but kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => manageCat && handleDeleteCategory(manageCat)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

// ---------- Stat Card ----------
function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "neutral" | "amber" | "emerald" | "rose";
}) {
  const toneMap = {
    neutral: "text-muted-foreground bg-muted/60",
    amber:
      "text-amber-600 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/40",
    emerald:
      "text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/40",
    rose: "text-rose-600 dark:text-rose-400 bg-rose-100/70 dark:bg-rose-950/40",
  } as const;
  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
            toneMap[tone]
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-semibold leading-tight tabular-nums">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Sortable Task Item ----------
function SortableTaskItem(props: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <TaskItem {...props} dragAttributes={attributes} dragListeners={listeners} />
    </li>
  );
}

// ---------- Task Item ----------
function TaskItem({
  task,
  onToggle,
  onEdit,
  onDelete,
  dragAttributes,
  dragListeners,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dragAttributes?: Record<string, unknown>;
  dragListeners?: Record<string, unknown>;
}) {
  const done = task.status === "completed";
  const due = formatDueDate(task.dueDate);
  const pmeta = PRIORITY_META[task.priority];
  const cmeta = task.category
    ? CATEGORY_COLORS[task.category.color]
    : null;

  return (
    <Card
      className={cn(
        "border-border/60 shadow-sm transition-all hover:shadow-md hover:border-border group",
        done && "opacity-60"
      )}
    >
      <CardContent className="p-3 sm:p-4 flex items-start gap-3">
        {dragListeners && (
          <button
            type="button"
            {...dragAttributes}
            {...dragListeners}
            aria-label="Drag to reorder"
            className="mt-1 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-label={done ? "Mark as pending" : "Mark as completed"}
          className="mt-0.5 shrink-0"
        >
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 transition-transform hover:scale-110" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p
              className={cn(
                "font-medium text-sm sm:text-base leading-snug break-words",
                done && "line-through text-muted-foreground"
              )}
            >
              {task.title}
            </p>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-5 font-medium gap-1",
                pmeta.badge
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", pmeta.dot)} />
              {pmeta.label}
            </Badge>
            {cmeta && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 h-5 font-medium gap-1",
                  cmeta.badge
                )}
              >
                <Tag className="h-2.5 w-2.5" />
                {task.category?.name}
              </Badge>
            )}
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground mt-1 break-words whitespace-pre-wrap">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {due.label && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs",
                  done
                    ? "text-muted-foreground"
                    : due.tone === "overdue"
                    ? "text-rose-600 dark:text-rose-400 font-medium"
                    : due.tone === "soon"
                    ? "text-amber-600 dark:text-amber-400 font-medium"
                    : "text-muted-foreground"
                )}
              >
                <CalendarClock className="h-3 w-3" />
                {due.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground/70 hidden sm:inline">
              Created {format(parseISO(task.createdAt), "MMM d")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onEdit}
                aria-label="Edit task"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                onClick={onDelete}
                aria-label="Delete task"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Empty State ----------
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card className="border-dashed border-border/60 bg-muted/20">
      <CardContent className="p-10 sm:p-14 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
          {hasFilters ? (
            <Search className="h-7 w-7" />
          ) : (
            <Check className="h-7 w-7" />
          )}
        </div>
        <h3 className="text-lg font-semibold">
          {hasFilters ? "No matching tasks" : "You're all caught up"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          {hasFilters
            ? "Try adjusting your search or filters to find what you're looking for."
            : "Add your first task above to start organizing your day."}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------- Edit Dialog ----------
function EditTaskDialog({
  task,
  categories,
  onClose,
  onSave,
}: {
  task: Task | null;
  categories: Category[];
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    priority: Priority;
    dueDate: string;
    categoryId: string;
  }) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<Priority>("medium");
  const [dueDate, setDueDate] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>("none");

  React.useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setPriority(task.priority);
      setDueDate(
        task.dueDate ? format(parseISO(task.dueDate), "yyyy-MM-dd") : ""
      );
      setCategoryId(task.categoryId ?? "none");
    }
  }, [task]);

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            Update the details below. Changes are saved instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as Priority)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-due">Due date</Label>
              <Input
                id="edit-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          CATEGORY_COLORS[c.color].dot
                        )}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({
                title: title.trim(),
                description: description.trim(),
                priority,
                dueDate,
                categoryId,
              })
            }
            disabled={!title.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Check className="h-4 w-4 mr-1.5" />
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
