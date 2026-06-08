"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { setStatus } from "@/lib/actions";

type BoardApp = {
  number: number;
  company: string;
  role: string;
  score: string;
  status: string;
};

const COLUMNS = ["Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP"];

function colTone(s: string): string {
  const x = s.toLowerCase();
  if (/offer/.test(x)) return "text-emerald-400";
  if (/interview/.test(x)) return "text-indigo-300";
  if (/applied|responded/.test(x)) return "text-amber-300";
  if (/reject|discard/.test(x)) return "text-rose-300";
  return "text-zinc-400";
}

function Card({ app, overlay = false }: { app: BoardApp; overlay?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-white/[0.06] bg-zinc-900/80 p-2.5 ${
        overlay ? "rotate-2 cursor-grabbing border-white/20 shadow-2xl shadow-black/50" : ""
      }`}
    >
      <div className="line-clamp-2 text-xs font-medium leading-snug text-zinc-100">{app.role}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
        <span className="truncate">{app.company}</span>
        <span className="shrink-0 font-mono tabular-nums">{app.score}</span>
      </div>
    </div>
  );
}

function DraggableCard({ app }: { app: BoardApp }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.number });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab touch-none transition-opacity hover:brightness-110 ${isDragging ? "opacity-30" : ""}`}
    >
      <Card app={app} />
    </div>
  );
}

function Column({ col, cards }: { col: string; cards: BoardApp[] }) {
  const droppable = col !== "Uncategorized";
  const { setNodeRef, isOver } = useDroppable({ id: col, disabled: !droppable });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-xl border p-2 transition-colors ${
        isOver ? "border-indigo-500/40 bg-indigo-500/[0.06]" : "border-white/[0.06] bg-zinc-900/30"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1.5 py-1">
        <span className={`text-xs font-semibold uppercase tracking-wide ${colTone(col)}`}>{col}</span>
        <span className="font-mono text-xs text-zinc-600">{cards.length}</span>
      </div>
      <div className="flex min-h-[60px] flex-col gap-2">
        {cards.map((a) => (
          <DraggableCard key={a.number} app={a} />
        ))}
        {cards.length === 0 && (
          <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-white/[0.05] py-4 text-[11px] text-zinc-700">
            {droppable ? "drop here" : "—"}
          </div>
        )}
      </div>
    </div>
  );
}

export function Board({ apps }: { apps: BoardApp[] }) {
  const [items, setItems] = useState(apps);
  const [activeNum, setActiveNum] = useState<number | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Re-sync to authoritative server state after a write-back refresh.
  useEffect(() => setItems(apps), [apps]);

  const canon = (s: string) => (COLUMNS.includes(s) ? s : "Uncategorized");
  const hasUncat = items.some((a) => !COLUMNS.includes(a.status));
  const columns = hasUncat ? ["Uncategorized", ...COLUMNS] : COLUMNS;
  const byCol = (col: string) => items.filter((a) => canon(a.status) === col);
  const active = items.find((a) => a.number === activeNum) || null;

  function onDragEnd(e: DragEndEvent) {
    setActiveNum(null);
    const num = Number(e.active.id);
    const col = e.over?.id ? String(e.over.id) : null;
    if (!col || col === "Uncategorized") return;
    const cur = items.find((a) => a.number === num);
    if (!cur || cur.status === col) return;

    const snapshot = items;
    setItems(items.map((a) => (a.number === num ? { ...a, status: col } : a)));
    start(async () => {
      const r = await setStatus(num, col);
      if (r.ok) router.refresh();
      else setItems(snapshot);
    });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveNum(Number(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveNum(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <Column key={col} col={col} cards={byCol(col)} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <div className="w-60"><Card app={active} overlay /></div> : null}</DragOverlay>
    </DndContext>
  );
}
