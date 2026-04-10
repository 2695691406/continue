import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import { useAppSelector } from "../../redux/hooks";

/** Matches the step shape from TeamsStateUpdatePayload */
interface SubAgentStep {
  type: "tool_call" | "text";
  timestamp: number;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  toolSuccess?: boolean;
  content?: string;
}

/** Matches the expert shape from TeamsStateUpdatePayload */
interface ExpertInfo {
  id: string;
  roleName: string;
  status: "idle" | "working" | "completed" | "failed";
  currentTaskSubject?: string;
  steps?: SubAgentStep[];
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  working: "Working",
  completed: "Done",
  failed: "Failed",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "text-gray-400",
  working: "text-blue-400",
  completed: "text-green-400",
  failed: "text-red-400",
};

/**
 * Renders a single sub-agent step (tool call or text).
 */
function StepItem({ step }: { step: SubAgentStep }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (step.type === "text") {
    return (
      <div className="flex items-start gap-1.5 py-0.5">
        <DocumentTextIcon className="text-description mt-0.5 h-3 w-3 flex-shrink-0" />
        <span className="text-description text-xs leading-relaxed">
          {step.content
            ? step.content.length > 120
              ? step.content.slice(0, 120) + "…"
              : step.content
            : "Response generated"}
        </span>
      </div>
    );
  }

  // Tool call step
  const StatusIcon = step.toolSuccess === false ? XCircleIcon : CheckCircleIcon;
  const statusColor =
    step.toolSuccess === false ? "text-red-400" : "text-green-400";

  return (
    <div className="py-0.5">
      <button
        className="flex w-full items-start gap-1.5 text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <WrenchScrewdriverIcon className="text-description mt-0.5 h-3 w-3 flex-shrink-0" />
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="text-foreground text-xs font-medium">
            {step.toolName || "unknown"}
          </span>
          <StatusIcon className={`h-3 w-3 flex-shrink-0 ${statusColor}`} />
          {(step.toolArgs || step.toolResult) && (
            <ChevronRightIcon
              className={`text-description h-2.5 w-2.5 flex-shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
            />
          )}
        </div>
      </button>

      {/* Expandable detail */}
      {isExpanded && (step.toolArgs || step.toolResult) && (
        <div className="border-description/10 ml-4 mt-0.5 border-l pl-2">
          {step.toolArgs && (
            <div className="mb-0.5">
              <span className="text-description text-[10px] font-medium uppercase">
                Args
              </span>
              <pre className="text-description mt-0.5 max-h-24 overflow-auto text-[10px] leading-tight">
                {formatArgs(step.toolArgs)}
              </pre>
            </div>
          )}
          {step.toolResult && (
            <div>
              <span className="text-description text-[10px] font-medium uppercase">
                Result
              </span>
              <pre className="text-description mt-0.5 max-h-24 overflow-auto text-[10px] leading-tight">
                {step.toolResult.length > 300
                  ? step.toolResult.slice(0, 300) + "…"
                  : step.toolResult}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the execution activity for a single expert agent.
 * Collapsed by default; click header to expand and see execution steps.
 */
function ExpertActivity({ expert }: { expert: ExpertInfo }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const steps = expert.steps || [];
  const toolCallCount = steps.filter((s) => s.type === "tool_call").length;
  const statusColor = STATUS_COLORS[expert.status] || "text-gray-400";
  const ChevronIcon = isExpanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div className="border-description/10 border-b last:border-b-0">
      <button
        className="flex w-full items-center gap-1.5 py-1.5 text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronIcon className="text-description h-3 w-3 flex-shrink-0" />
        <span className={`text-xs font-medium ${statusColor}`}>
          {expert.roleName}
        </span>
        {expert.status === "working" && (
          <span className="text-blue-400 animate-pulse text-xs">●</span>
        )}
        <span className="text-description ml-auto text-[10px]">
          {expert.status === "working"
            ? `${toolCallCount} step${toolCallCount !== 1 ? "s" : ""}`
            : STATUS_LABELS[expert.status]}
          {expert.currentTaskSubject && (
            <span className="ml-1 max-w-24 truncate">
              · {expert.currentTaskSubject}
            </span>
          )}
        </span>
      </button>

      {/* Expanded step list */}
      <div
        className={`overflow-y-auto transition-all duration-200 ease-in-out ${
          isExpanded ? "max-h-60 pb-1.5 pl-4 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {steps.length === 0 ? (
          <div className="text-description py-1 text-[10px] italic">
            No execution steps yet
          </div>
        ) : (
          steps.map((step, i) => <StepItem key={i} step={step} />)
        )}
      </div>
    </div>
  );
}

/**
 * SubAgentActivity - Shows all sub-agent execution processes in the GUI.
 *
 * Displays a collapsible panel for each expert agent that has been dispatched.
 * Each expert section is collapsed by default, and clicking expands it to
 * show the execution steps (tool calls, text responses).
 *
 * This provides full visibility into what each sub-agent is doing during
 * teams mode without cluttering the main chat interface.
 */
export function SubAgentActivity() {
  const teamsState = useAppSelector((state) => state.session.teamsState);

  const experts = useMemo(() => {
    if (!teamsState?.experts) return [];
    // Show only experts that have been dispatched (not idle with no steps)
    return teamsState.experts.filter(
      (e) => e.status !== "idle" || (e.steps && e.steps.length > 0),
    );
  }, [teamsState]);

  if (!experts.length) {
    return null;
  }

  const workingCount = experts.filter((e) => e.status === "working").length;
  const completedCount = experts.filter((e) => e.status === "completed").length;

  return (
    <div className="border-description/20 bg-lightgray/10 mb-2 rounded-md border">
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-description text-xs font-medium">
          Sub-Agent Activity
        </span>
        <span className="text-description text-[10px]">
          {workingCount > 0 && (
            <span className="text-blue-400">
              {workingCount} running
            </span>
          )}
          {workingCount > 0 && completedCount > 0 && " · "}
          {completedCount > 0 && (
            <span className="text-green-400">
              {completedCount} done
            </span>
          )}
        </span>
      </div>
      <div className="border-description/10 border-t px-2">
        {experts.map((expert) => (
          <ExpertActivity key={expert.id} expert={expert} />
        ))}
      </div>
    </div>
  );
}

/**
 * Format tool arguments for display.
 * Attempts JSON pretty-print, falls back to raw string.
 */
function formatArgs(args: string): string {
  try {
    const parsed = JSON.parse(args);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return args;
  }
}
