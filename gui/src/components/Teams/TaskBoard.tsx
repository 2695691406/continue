import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  PlayIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { useAppSelector } from "../../redux/hooks";

const TASK_STATUS_ICON = {
  pending: { icon: ClockIcon, color: "text-gray-400" },
  in_progress: { icon: PlayIcon, color: "text-blue-400" },
  completed: { icon: CheckCircleIcon, color: "text-green-400" },
  cancelled: { icon: XCircleIcon, color: "text-gray-500" },
  failed: { icon: ExclamationCircleIcon, color: "text-red-400" },
} as const;

/**
 * TaskBoard displays a collapsible task board showing all
 * tasks created by the Leader agent in teams mode.
 */
export function TaskBoard() {
  const teamsState = useAppSelector((state) => state.session.teamsState);
  const [isExpanded, setIsExpanded] = useState(false);

  const tasks = useMemo(() => teamsState?.tasks ?? [], [teamsState]);

  if (!tasks.length) {
    return null;
  }

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="border-description/20 bg-lightgray/10 mb-2 rounded-md border">
      {/* Header */}
      <button
        className="flex w-full items-center justify-between p-2 text-xs"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-description font-medium">
          Task Board ({completedCount}/{totalCount})
        </span>
        <div className="flex items-center gap-2">
          {/* Progress bar */}
          <div className="bg-lightgray/30 h-1.5 w-16 rounded-full">
            <div
              className="h-full rounded-full bg-green-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-description">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Task list */}
      {isExpanded && (
        <div className="border-description/10 border-t px-2 pb-2">
          {tasks.map((task) => {
            const statusConfig =
              TASK_STATUS_ICON[task.status as keyof typeof TASK_STATUS_ICON] ??
              TASK_STATUS_ICON.pending;
            const Icon = statusConfig.icon;
            return (
              <div
                key={task.id}
                className="mt-1.5 flex items-start gap-1.5 text-xs"
              >
                <Icon
                  className={`mt-0.5 h-3 w-3 flex-shrink-0 ${statusConfig.color}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate">{task.subject}</div>
                  {task.assignee && (
                    <div className="text-description truncate">
                      → {task.assignee}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
