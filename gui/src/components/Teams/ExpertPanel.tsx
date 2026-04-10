import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useMemo } from "react";
import { useAppSelector } from "../../redux/hooks";

const STATUS_CONFIG = {
  idle: { color: "text-gray-400", icon: UserIcon, label: "Idle" },
  working: { color: "text-blue-400", icon: UserIcon, label: "Working" },
  completed: {
    color: "text-green-400",
    icon: CheckCircleIcon,
    label: "Done",
  },
  failed: {
    color: "text-red-400",
    icon: ExclamationCircleIcon,
    label: "Failed",
  },
} as const;

/**
 * ExpertPanel displays the current status of expert agents
 * in the teams mode. Shown as a compact inline panel
 * within the chat interface.
 */
export function ExpertPanel() {
  const teamsState = useAppSelector((state) => state.session.teamsState);

  const experts = useMemo(() => teamsState?.experts ?? [], [teamsState]);

  if (!experts.length) {
    return null;
  }

  return (
    <div className="border-description/20 bg-lightgray/10 mb-2 rounded-md border p-2">
      <div className="text-description mb-1.5 text-xs font-medium">
        Expert Team
      </div>
      <div className="flex flex-wrap gap-2">
        {experts.map((expert) => {
          const config =
            STATUS_CONFIG[expert.status] ?? STATUS_CONFIG.idle;
          const Icon = config.icon;
          return (
            <div
              key={expert.id}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${config.color} bg-lightgray/20`}
              title={
                expert.currentTaskSubject
                  ? `Working on: ${expert.currentTaskSubject}`
                  : config.label
              }
            >
              <Icon className="h-3 w-3" />
              <span className="max-w-20 truncate">{expert.roleName}</span>
              {expert.status === "working" && (
                <span className="ml-0.5 animate-pulse">●</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
