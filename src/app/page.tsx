"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Plus, GripVertical } from "lucide-react";

type Task = { id: string; column_id: string; content: string; position: number };
type Column = { id: string; title: string; position: number; tasks: Task[] };

export default function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [newTaskContent, setNewTaskContent] = useState("");
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

  useEffect(() => {
    fetchBoardData();
  }, []);

  const fetchBoardData = async () => {
    const { data: colsData } = await supabase.from("columns").select("*").order("position");
    const { data: tasksData } = await supabase.from("tasks").select("*").order("position");

    if (colsData && tasksData) {
      const formattedColumns = colsData.map((col) => ({
        ...col,
        tasks: tasksData.filter((task) => task.column_id === col.id),
      }));
      setColumns(formattedColumns);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceColIndex = columns.findIndex((col) => col.id === source.droppableId);
    const destColIndex = columns.findIndex((col) => col.id === destination.droppableId);
    const sourceCol = columns[sourceColIndex];
    const destCol = columns[destColIndex];
    const sourceTasks = Array.from(sourceCol.tasks);
    const destTasks = Array.from(destCol.tasks);
    const [movedTask] = sourceTasks.splice(source.index, 1);

    // Moving within the same column
    if (source.droppableId === destination.droppableId) {
      sourceTasks.splice(destination.index, 0, movedTask);
      const newColumns = [...columns];
      newColumns[sourceColIndex].tasks = sourceTasks.map((t, i) => ({ ...t, position: i }));
      setColumns(newColumns);

      // Persist to Supabase
      const updates = sourceTasks.map((t, i) => ({ id: t.id, position: i }));
      await supabase.from("tasks").upsert(updates);
    } else {
      // Moving across columns
      movedTask.column_id = destination.droppableId;
      destTasks.splice(destination.index, 0, movedTask);
      
      const newColumns = [...columns];
      newColumns[sourceColIndex].tasks = sourceTasks.map((t, i) => ({ ...t, position: i }));
      newColumns[destColIndex].tasks = destTasks.map((t, i) => ({ ...t, position: i }));
      setColumns(newColumns);

      // Persist to Supabase
      await supabase.from("tasks").update({ column_id: destination.droppableId }).eq("id", movedTask.id);
      const sourceUpdates = sourceTasks.map((t, i) => ({ id: t.id, position: i }));
      const destUpdates = destTasks.map((t, i) => ({ id: t.id, position: i }));
      await supabase.from("tasks").upsert([...sourceUpdates, ...destUpdates]);
    }
  };

  const addTask = async (columnId: string) => {
    if (!newTaskContent.trim()) return;
    const colIndex = columns.findIndex((col) => col.id === columnId);
    const position = columns[colIndex].tasks.length;
    
    const { data, error } = await supabase
      .from("tasks")
      .insert({ column_id: columnId, content: newTaskContent, position })
      .select()
      .single();

    if (!error && data) {
      const newColumns = [...columns];
      newColumns[colIndex].tasks.push(data);
      setColumns(newColumns);
      setNewTaskContent("");
      setActiveColumnId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E1015] text-slate-200 p-8 font-sans selection:bg-indigo-500/30">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-white">kataomoyi Workspace</h1>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex items-start gap-6 overflow-x-auto pb-4">
          {columns.map((column) => (
            <div key={column.id} className="flex w-80 shrink-0 flex-col rounded-xl bg-[#16181D] border border-white/5">
              <div className="flex items-center justify-between p-4 pb-2">
                <h3 className="font-medium text-slate-300 text-sm">{column.title}</h3>
                <span className="flex h-5 w-5 items-center justify-center rounded bg-[#22252A] text-xs text-slate-500 font-medium">
                  {column.tasks.length}
                </span>
              </div>

              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn("flex flex-col gap-2 p-3 min-h-[150px] transition-colors", snapshot.isDraggingOver && "bg-white/[0.02]")}
                  >
                    {column.tasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={cn(
                              "group relative flex cursor-grab flex-col gap-2 rounded-lg bg-[#22252A] p-3 border border-white/5 shadow-sm transition-all hover:border-white/10 active:cursor-grabbing",
                              snapshot.isDragging && "shadow-2xl shadow-black/50 rotate-2 border-indigo-500/50 bg-[#2A2D35]"
                            )}
                          >
                            <p className="text-sm text-slate-300 leading-relaxed">{task.content}</p>
                            <GripVertical className="absolute right-2 top-3 h-4 w-4 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              <div className="p-3 pt-0">
                {activeColumnId === column.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      autoFocus
                      placeholder="Task description..."
                      value={newTaskContent}
                      onChange={(e) => setNewTaskContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          addTask(column.id);
                        }
                      }}
                      className="w-full resize-none rounded-lg bg-[#0E1015] p-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/50"
                      rows={3}
                    />
                    <div className="flex items-center gap-2">
                      <button onClick={() => addTask(column.id)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors">
                        Add Issue
                      </button>
                      <button onClick={() => setActiveColumnId(null)} className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveColumnId(column.id)}
                    className="flex w-full items-center gap-2 rounded-lg p-2 text-sm text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add task
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
