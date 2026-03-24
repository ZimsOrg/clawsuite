import type { DecomposeResult, DecomposerContext, DecomposedTask, TaskAgentRole } from "./types";
import { OpenClawClient } from "./openclaw-client";

const SYSTEM_PROMPT = [
  "You are a task decomposition engine for an engineering workspace daemon.",
  "Return only a valid JSON array with no markdown fences and no surrounding explanation.",
  "Each array item must be an object with keys:",
  "name, description, estimated_minutes, depends_on, suggested_agent_type.",
  "Use concise but actionable task names and descriptions.",
  "estimated_minutes must be a positive integer.",
  "depends_on must be an array of task names from the same response.",
  "suggested_agent_type must be one of: planner, coder, critic, researcher, or null.",
  "Use coder for implementation, planner for decomposition, critic for review, researcher for analysis.",
].join(" ");

const VALID_AGENT_TYPES = new Set<TaskAgentRole>([
  "planner",
  "coder",
  "critic",
  "researcher",
  "frontend",
  "backend",
  "reviewer",
]);

function buildPrompt(goal: string, context?: DecomposerContext): string {
  const lines = [
    SYSTEM_PROMPT,
    "",
    "You are a task decomposition engine. Given a goal, return ONLY a valid JSON array (no markdown, no explanation).",
    "Each item: { name, description, estimated_minutes, depends_on, suggested_agent_type }",
    "suggested_agent_type: planner | coder | critic | researcher | null",
    "",
    `Goal: ${goal.trim()}`,
  ];

  if (context?.project_path) {
    lines.push(`Project path: ${context.project_path}`);
  }

  if (context?.project_spec) {
    lines.push("Project spec:");
    lines.push(context.project_spec);
  }

  if (context?.existing_files && context.existing_files.length > 0) {
    lines.push("Existing files:");
    lines.push(...context.existing_files.map((file) => `- ${file}`));
  }

  return lines.join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractJsonArray(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    const candidate = fencedMatch[1]?.trim();
    if (candidate?.startsWith("[") && candidate.endsWith("]")) {
      return candidate;
    }
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return null;
}

function toPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeAgentType(value: unknown): TaskAgentRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "codex") {
    return "coder";
  }

  if (normalized === "claude" || normalized === "ollama") {
    return "researcher";
  }

  if (normalized === "openclaw") {
    return "planner";
  }

  return VALID_AGENT_TYPES.has(normalized as TaskAgentRole)
    ? (normalized as TaskAgentRole)
    : null;
}

function normalizeTask(value: unknown, index: number): DecomposedTask {
  const candidate = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const fallbackName = `Task ${index + 1}`;
  const name = typeof candidate.name === "string" && candidate.name.trim().length > 0 ? candidate.name.trim() : fallbackName;
  const description =
    typeof candidate.description === "string" && candidate.description.trim().length > 0
      ? candidate.description.trim()
      : name;
  const depends_on = Array.isArray(candidate.depends_on)
    ? candidate.depends_on.filter((dependency): dependency is string => typeof dependency === "string" && dependency.trim().length > 0)
    : [];

  return {
    name,
    description,
    estimated_minutes: toPositiveInteger(candidate.estimated_minutes, 30),
    depends_on,
    suggested_agent_type: normalizeAgentType(candidate.suggested_agent_type),
  };
}

function ensureClarifyTask(tasks: DecomposedTask[]): DecomposedTask[] {
  return tasks;
}

export class Decomposer {
  private readonly openclawClient = new OpenClawClient();

  async decompose(goal: string, context?: DecomposerContext): Promise<DecomposeResult> {
    const prompt = buildPrompt(goal, context);
    let rawResponse = "";
    let gatewayError = "";

    try {
      const session = await this.openclawClient.spawnSession({
        task: prompt,
        mode: "run",
        label: "decomposer",
        runTimeoutSeconds: 60,
      });

      const startedAt = Date.now();

      while (Date.now() - startedAt < 60_000) {
        const status = await this.openclawClient.getSessionStatus(session.sessionKey);
        if (status.status === "completed") {
          break;
        }

        if (status.status === "failed" || status.status === "timeout") {
          gatewayError = status.lastMessage?.trim() || `Gateway session ${status.status}`;
          break;
        }

        await sleep(2_000);
      }

      if (!gatewayError) {
        const history = await this.openclawClient.getSessionHistory(session.sessionKey);
        const assistantMessages = history.filter(
          (message) => message.role === "assistant" && message.content.trim().length > 0,
        );
        rawResponse = assistantMessages.at(-1)?.content.trim() || "";
        if (!rawResponse) {
          gatewayError = "Gateway session returned no assistant response";
        }
      }
    } catch (error) {
      gatewayError = error instanceof Error ? error.message : "Gateway session failed";
    }

    if (!rawResponse) {
      const name = goal.trim().slice(0, 80) || "Task decomposition";
      return {
        tasks: [
          {
            name,
            description: goal.trim() || name,
            estimated_minutes: 30,
            depends_on: [],
            suggested_agent_type: null,
          },
        ],
        rawResponse: gatewayError,
        parsed: false,
      };
    }

    const jsonPayload = extractJsonArray(rawResponse);

    if (jsonPayload) {
      try {
        const parsed = JSON.parse(jsonPayload) as unknown;
        if (Array.isArray(parsed)) {
          return {
            tasks: ensureClarifyTask(parsed.map((task, index) => normalizeTask(task, index))),
            rawResponse,
            parsed: true,
          };
        }
      } catch {
        // Fall through to the raw-text fallback below.
      }
    }

    return {
      tasks: ensureClarifyTask([
        {
          name: goal.trim().slice(0, 80) || "Task decomposition",
          description: rawResponse || goal.trim(),
          estimated_minutes: 30,
          depends_on: [],
          suggested_agent_type: "researcher",
        },
      ]),
      rawResponse,
      parsed: false,
    };
  }
}
