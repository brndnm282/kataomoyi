"use client";

import { useEffect, useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Plus,
  GripVertical,
  Calendar,
  Tag,
  MessageSquare,
  Activity,
  Users,
  X,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
} from "lucide-react";

type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
type TaskPriority = "low" | "normal" | "high";

interface TeamMember {
  id: string;
  name: string;
  color: string;
  role: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
  labels: string[];
  position: number;
  created_at: string;
}

interface Comment {
  id: string;
  task_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface ActivityLog {
  id: string;
  task_id: string;
  action: string;
  created_at: string;
}

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "in_review", title: "In Review" },
  { id: "done", title: "Done" },
];

const PRIORITY_STYLES: Record<TaskPriority, { label: string; badge: string }> = {
  low: { label: "Low", badge: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  normal: { label: "Normal", badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  high: { label: "High", badge: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
};

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Quick Add Task State
  const [activeColumn, setActiveColumn] = useState<TaskStatus | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("normal");

  // Task Modal State
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("Guest");
  const [newLabelInput, setNewLabelInput] = useState("");

  // Team Member Modal State
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("Engineer");
  const [newMemberColor, setNewMemberColor] = useState("#6366f1");

  const logActivity = async (taskId: string, action: string) => {
    const { data } = await supabase
      .from("activity_logs")
      .insert({ task_id: taskId, action })
      .select()
      .single();
    if (data && selectedTask?.id === taskId) {
      setActivityLogs((prev) => [data, ...prev]);
    }
  };

  const fetchBoardData = useCallback(async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setAuthError(
          "Anonymous sign-ins are disabled in Supabase. Enable them under Authentication -> Providers -> Anonymous."
        );
        setLoading(false);
        return;
      }
    }

    const [{ data: membersData }, { data: tasksData }] = await Promise.all([
      supabase.from("team_members").select("*").order("created_at"),
      supabase.from("tasks").select("*").order("position"),
    ]);

    // Seed initial data if this is a brand new anonymous workspace
    if ((!membersData || membersData.length === 0) && (!tasksData || tasksData.length === 0)) {
      const { data: seededMembers } = await supabase
        .from("team_members")
        .insert([
          { name: "Alex Rivera", role: "Frontend", color: "#6366f1" },
          { name: "Sam Chen", role: "Backend", color: "#10b981" },
        ])
        .select();

      const firstAssignee = seededMembers?.[0]?.id ?? null;

      const { data: seededTasks } = await supabase
        .from("tasks")
        .insert([
          {
            title: "Configure Supabase RLS & guest isolation",
            description: "Ensure anonymous sessions isolate rows by auth.uid().",
            status: "done",
            priority: "high",
            assignee_id: firstAssignee,
            labels: ["security", "database"],
            position: 0,
          },
          {
            title: "Implement drag-and-drop workflow states",
            description: "Allow cards to move smoothly across todo, in_progress, in_review, and done.",
            status: "in_progress",
            priority: "normal",
            assignee_id: firstAssignee,
            labels: ["ui", "kanban"],
            position: 0,
          },
          {
            title: "Bind custom Cloudflare DNS domain",
            description: "Route traffic from custom subdomain to Cloudflare Pages deployment.",
            status: "todo",
            priority: "low",
            labels: ["devops"],
            position: 0,
          },
        ])
        .select();

      setTeamMembers(seededMembers || []);
      setTasks(seededTasks || []);
    } else {
      setTeamMembers(membersData || []);
      setTasks(tasksData || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBoardData();
  }, [fetchBoardData]);

  const openTaskDetails = async (task: Task) => {
    setSelectedTask(task);
    const [{ data: commentsData }, { data: logsData }] = await Promise.all([
      supabase.from("comments").select("*").eq("task_id", task.id).order("created_at", { ascending: false }),
      supabase.from("activity_logs").select("*").eq("task_id", task.id).order("created_at", { ascending: false }),
    ]);
    setComments(commentsData || []);
    setActivityLogs(logsData || []);
  };

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceStatus = source.droppableId as TaskStatus;
    const destStatus = destination.droppableId as TaskStatus;

    const sourceList = tasks
      .filter((t) => t.status === sourceStatus)
      .sort((a, b) => a.position - b.position);
    const destList =
      sourceStatus === destStatus
        ? sourceList
        : tasks.filter((t) => t.status === destStatus).sort((a, b) => a.position - b.position);

    const movedTaskIndex = sourceList.findIndex((t) => t.id === draggableId);
    if (movedTaskIndex === -1) return;

    const [movedTask] = sourceList.splice(movedTaskIndex, 1);
    const updatedMovedTask: Task = { ...movedTask, status: destStatus };

    destList.splice(destination.index, 0, updatedMovedTask);

    const updatedSource = sourceList.map((t, idx) => ({ ...t, position: idx }));
    const updatedDest = destList.map((t, idx) => ({ ...t, position: idx }));

    const unchangedTasks = tasks.filter(
      (t) => t.status !== sourceStatus && t.status !== destStatus
    );

    const nextTasks =
      sourceStatus === destStatus
        ? [...unchangedTasks, ...updatedDest]
        : [...unchangedTasks, ...updatedSource, ...updatedDest];

    setTasks(nextTasks);

    const toUpsert = sourceStatus === destStatus ? updatedDest : [...updatedSource, ...updatedDest];

    await Promise.all(
      toUpsert.map((t) =>
        supabase
          .from("tasks")
          .update({ status: t.status, position: t.position })
          .eq("id", t.id)
      )
    );

    if (sourceStatus !== destStatus) {
      await logActivity(draggableId, `Moved from ${sourceStatus.replace("_", " ")} to ${destStatus.replace("_", " ")}`);
    }
  };

  const handleCreateTask = async (status: TaskStatus) => {
    if (!newTaskTitle.trim()) return;
    const columnTasks = tasks.filter((t) => t.status === status);
    const position = columnTasks.length;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: newTaskTitle.trim(),
        status,
        priority: newTaskPriority,
        position,
      })
      .select()
      .single();

    if (!error && data) {
      setTasks((prev) => [...prev, data]);
      await logActivity(data.id, `Created task in ${status.replace("_", " ")}`);
      setNewTaskTitle("");
      setNewTaskPriority("normal");
      setActiveColumn(null);
    }
  };

  const handleUpdateTaskField = async (taskId: string, updates: Partial<Task>, activityMessage?: string) => {
    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .select()
      .single();

    if (!error && data) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data : t)));
      setSelectedTask(data);
      if (activityMessage) {
        await logActivity(taskId, activityMessage);
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (!error) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedTask(null);
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !newComment.trim()) return;
    const { data, error } = await supabase
      .from("comments")
      .insert({
        task_id: selectedTask.id,
        author_name: commentAuthor.trim() || "Guest",
        content: newComment.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setComments((prev) => [data, ...prev]);
      setNewComment("");
      await logActivity(selectedTask.id, `${data.author_name} added a comment`);
    }
  };

  const handleAddLabel = async () => {
    if (!selectedTask || !newLabelInput.trim()) return;
    const cleanLabel = newLabelInput.trim().toLowerCase();
    if (selectedTask.labels.includes(cleanLabel)) {
      setNewLabelInput("");
      return;
    }
    const updatedLabels = [...selectedTask.labels, cleanLabel];
    setNewLabelInput("");
    await handleUpdateTaskField(selectedTask.id, { labels: updatedLabels }, `Added label "${cleanLabel}"`);
  };

  const handleRemoveLabel = async (labelToRemove: string) => {
    if (!selectedTask) return;
    const updatedLabels = selectedTask.labels.filter((l) => l !== labelToRemove);
    await handleUpdateTaskField(selectedTask.id, { labels: updatedLabels }, `Removed label "${labelToRemove}"`);
  };

  const handleCreateMember = async () => {
    if (!newMemberName.trim()) return;
    const { data, error } = await supabase
      .from("team_members")
      .insert({
        name: newMemberName.trim(),
        role: newMemberRole.trim() || "Member",
        color: newMemberColor,
      })
      .select()
      .single();

    if (!error && data) {
      setTeamMembers((prev) => [...prev, data]);
      setNewMemberName("");
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case "todo":
        return <AlertCircle className="h-4 w-4 text-slate-400" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-indigo-400" />;
      case "in_review":
        return <Eye className="h-4 w-4 text-amber-400" />;
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D11] text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Top Navbar */}
      <header className="border-b border-white/5 bg-[#111319]/80 backdrop-blur sticky top-0 z-20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">
            K
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white leading-none">kataomoyi</h1>
            <p className="text-xs text-slate-500 mt-1">Visual Task & Workflow Board</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex -space-x-2">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                title={`${member.name} (${member.role})`}
                style={{ backgroundColor: member.color }}
                className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold text-white ring-2 ring-[#111319]"
              >
                {member.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowTeamModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#1A1D24] hover:bg-[#222630] border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors"
          >
            <Users className="h-3.5 w-3.5 text-indigo-400" />
            Team ({teamMembers.length})
          </button>
        </div>
      </header>

      {authError && (
        <div className="mx-6 mt-6 rounded-lg bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-300">
          {authError}
        </div>
      )}

      {/* Main Board */}
      <main className="p-6">
        {loading ? (
          <div className="text-sm text-slate-500 py-12 text-center">Loading workspace...</div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
              {COLUMNS.map((col) => {
                const colTasks = tasks
                  .filter((t) => t.status === col.id)
                  .sort((a, b) => a.position - b.position);

                return (
                  <div
                    key={col.id}
                    className="flex flex-col rounded-xl bg-[#13161C] border border-white/5 shadow-xl"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between p-4 pb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(col.id)}
                        <h2 className="text-sm font-medium text-slate-200">{col.title}</h2>
                      </div>
                      <span className="rounded-full bg-[#1C2029] px-2 py-0.5 text-xs font-medium text-slate-400">
                        {colTasks.length}
                      </span>
                    </div>

                    {/* Droppable Area */}
                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "flex flex-col gap-2.5 p-3 min-h-[180px] transition-colors rounded-lg",
                            snapshot.isDraggingOver && "bg-indigo-500/[0.04]"
                          )}
                        >
                          {colTasks.map((task, index) => {
                            const assignee = teamMembers.find((m) => m.id === task.assignee_id);
                            return (
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    onClick={() => openTaskDetails(task)}
                                    className={cn(
                                      "group relative flex flex-col gap-2.5 rounded-lg bg-[#1B1F27] p-3.5 border border-white/5 shadow-sm transition-all hover:border-indigo-500/40 cursor-pointer",
                                      snapshot.isDragging &&
                                        "shadow-2xl shadow-black/70 ring-1 ring-indigo-500 bg-[#222733]"
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <span
                                        className={cn(
                                          "text-[10px] font-medium px-2 py-0.5 rounded border uppercase tracking-wider",
                                          PRIORITY_STYLES[task.priority].badge
                                        )}
                                      >
                                        {PRIORITY_STYLES[task.priority].label}
                                      </span>
                                      <GripVertical className="h-4 w-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                    </div>

                                    <p className="text-sm font-medium text-slate-200 leading-snug">
                                      {task.title}
                                    </p>

                                    {task.labels && task.labels.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {task.labels.map((label) => (
                                          <span
                                            key={label}
                                            className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400"
                                          >
                                            #{label}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs text-slate-500">
                                      <div className="flex items-center gap-1.5">
                                        {task.due_date && (
                                          <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                            <Calendar className="h-3 w-3" />
                                            {format(new Date(task.due_date), "MMM d")}
                                          </span>
                                        )}
                                      </div>

                                      {assignee && (
                                        <div
                                          style={{ backgroundColor: assignee.color }}
                                          title={assignee.name}
                                          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                        >
                                          {assignee.name.slice(0, 2).toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>

                    {/* Quick Add Task Footer */}
                    <div className="p-3 pt-0">
                      {activeColumn === col.id ? (
                        <div className="flex flex-col gap-2 rounded-lg bg-[#0E1015] p-2.5 border border-white/10">
                          <textarea
                            autoFocus
                            rows={2}
                            placeholder="Task title..."
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleCreateTask(col.id);
                              }
                            }}
                            className="w-full resize-none bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none"
                          />
                          <div className="flex items-center justify-between pt-1 border-t border-white/5">
                            <select
                              value={newTaskPriority}
                              onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                              className="rounded bg-[#181B22] px-2 py-1 text-xs text-slate-300 border border-white/10 outline-none"
                            >
                              <option value="low">Low Priority</option>
                              <option value="normal">Normal Priority</option>
                              <option value="high">High Priority</option>
                            </select>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setActiveColumn(null)}
                                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleCreateTask(col.id)}
                                className="rounded bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 text-xs font-medium text-white transition-colors"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveColumn(col.id)}
                          className="flex w-full items-center gap-1.5 rounded-lg p-2 text-xs font-medium text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add task
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        )}
      </main>

      {/* Task Details Slide-Over Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-[#13161C] border-l border-white/10 h-full overflow-y-auto p-6 flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
              <input
                value={selectedTask.title}
                onChange={(e) => setSelectedTask({ ...selectedTask, title: e.target.value })}
                onBlur={() =>
                  handleUpdateTaskField(selectedTask.id, { title: selectedTask.title }, "Updated title")
                }
                className="text-lg font-semibold text-white bg-transparent outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -ml-1 w-full"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDeleteTask(selectedTask.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Delete Task"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Metadata Controls */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-slate-500 block mb-1">Status</label>
                <select
                  value={selectedTask.status}
                  onChange={(e) =>
                    handleUpdateTaskField(
                      selectedTask.id,
                      { status: e.target.value as TaskStatus },
                      `Status changed to ${e.target.value}`
                    )
                  }
                  className="w-full rounded-lg bg-[#1B1F27] border border-white/10 p-2 text-slate-200 outline-none"
                >
                  {COLUMNS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Priority</label>
                <select
                  value={selectedTask.priority}
                  onChange={(e) =>
                    handleUpdateTaskField(
                      selectedTask.id,
                      { priority: e.target.value as TaskPriority },
                      `Priority set to ${e.target.value}`
                    )
                  }
                  className="w-full rounded-lg bg-[#1B1F27] border border-white/10 p-2 text-slate-200 outline-none"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Assignee</label>
                <select
                  value={selectedTask.assignee_id || ""}
                  onChange={(e) =>
                    handleUpdateTaskField(
                      selectedTask.id,
                      { assignee_id: e.target.value || null },
                      "Updated assignee"
                    )
                  }
                  className="w-full rounded-lg bg-[#1B1F27] border border-white/10 p-2 text-slate-200 outline-none"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Due Date</label>
                <input
                  type="date"
                  value={selectedTask.due_date || ""}
                  onChange={(e) =>
                    handleUpdateTaskField(
                      selectedTask.id,
                      { due_date: e.target.value || null },
                      `Set due date to ${e.target.value || "none"}`
                    )
                  }
                  className="w-full rounded-lg bg-[#1B1F27] border border-white/10 p-2 text-slate-200 outline-none"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Description</label>
              <textarea
                rows={4}
                placeholder="Add task details..."
                value={selectedTask.description || ""}
                onChange={(e) => setSelectedTask({ ...selectedTask, description: e.target.value })}
                onBlur={() =>
                  handleUpdateTaskField(
                    selectedTask.id,
                    { description: selectedTask.description },
                    "Updated description"
                  )
                }
                className="w-full rounded-lg bg-[#1B1F27] border border-white/10 p-3 text-sm text-slate-200 outline-none focus:border-indigo-500"
              />
            </div>

            {/* Labels */}
            <div>
              <label className="text-xs text-slate-500 flex items-center gap-1.5 mb-2">
                <Tag className="h-3.5 w-3.5" /> Labels
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedTask.labels?.map((label) => (
                  <span
                    key={label}
                    className="flex items-center gap-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300"
                  >
                    #{label}
                    <button onClick={() => handleRemoveLabel(label)} className="hover:text-white">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  placeholder="Add label..."
                  value={newLabelInput}
                  onChange={(e) => setNewLabelInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
                  className="rounded-lg bg-[#1B1F27] border border-white/10 px-3 py-1.5 text-xs text-slate-200 outline-none"
                />
                <button
                  onClick={handleAddLabel}
                  className="rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Comments */}
            <div className="border-t border-white/5 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-3">
                <MessageSquare className="h-3.5 w-3.5" /> Comments ({comments.length})
              </h3>
              <div className="flex flex-col gap-2 mb-4">
                <input
                  placeholder="Your name"
                  value={commentAuthor}
                  onChange={(e) => setCommentAuthor(e.target.value)}
                  className="w-40 rounded-lg bg-[#1B1F27] border border-white/10 px-2.5 py-1 text-xs text-slate-200 outline-none"
                />
                <div className="flex gap-2">
                  <input
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                    className="flex-1 rounded-lg bg-[#1B1F27] border border-white/10 px-3 py-2 text-xs text-slate-200 outline-none"
                  />
                  <button
                    onClick={handleAddComment}
                    className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-xs font-medium text-white"
                  >
                    Post
                  </button>
                </div>
              </div>
              <div className="space-y-2.5 max-h-48 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-[#1B1F27] p-3 text-xs border border-white/5">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span className="font-semibold text-slate-200">{c.author_name}</span>
                      <span>{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
                    </div>
                    <p className="text-slate-300">{c.content}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Log */}
            <div className="border-t border-white/5 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-3">
                <Activity className="h-3.5 w-3.5" /> Activity History
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto text-xs text-slate-400">
                {activityLogs.map((log) => (
                  <div key={log.id} className="flex justify-between py-1 border-b border-white/5">
                    <span>{log.action}</span>
                    <span className="text-slate-600">{format(new Date(log.created_at), "MMM d, h:mm a")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Management Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-[#13161C] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Team Members</h3>
              <button onClick={() => setShowTeamModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {teamMembers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg bg-[#1B1F27] p-2.5 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-4 w-4 rounded-full" style={{ backgroundColor: m.color }} />
                    <span className="font-medium text-slate-200">{m.name}</span>
                  </div>
                  <span className="text-slate-500">{m.role}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-white/5 pt-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <input
                  placeholder="Name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="col-span-2 rounded-lg bg-[#1B1F27] border border-white/10 px-3 py-1.5 text-xs text-slate-200 outline-none"
                />
                <input
                  placeholder="Role"
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  className="rounded-lg bg-[#1B1F27] border border-white/10 px-3 py-1.5 text-xs text-slate-200 outline-none"
                />
              </div>
              <div className="flex items-center justify-between">
                <input
                  type="color"
                  value={newMemberColor}
                  onChange={(e) => setNewMemberColor(e.target.value)}
                  className="h-7 w-12 rounded bg-transparent cursor-pointer"
                />
                <button
                  onClick={handleCreateMember}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Add Member
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
