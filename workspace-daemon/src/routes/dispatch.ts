import { Router } from "express";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { Tracker } from "../tracker";

const STATE_PATH = join(
  process.env.HOME || "/Users/aurora",
  ".openclaw/workspace/data/dispatch-state.json"
);

export function createDispatchRouter(tracker?: Tracker): Router {
  const router = Router();

  router.get("/state", (_req, res) => {
    if (!existsSync(STATE_PATH)) {
      return res.json({ status: "idle", tasks: [] });
    }
    try {
      const raw = readFileSync(STATE_PATH, "utf-8");
      res.json(JSON.parse(raw));
    } catch {
      res.status(500).json({ error: "Failed to read dispatch state" });
    }
  });

  router.post("/start", (req, res) => {
    const { mission, mode, tasks, projectPath } = req.body;
    if (!mission) return res.status(400).json({ error: "mission is required" });

    const missionId = "mission-" + Date.now();
    const now = new Date().toISOString();

    const state = {
      mission_id: missionId,
      mission,
      status: "pending_dispatch",
      created_at: now,
      updated_at: now,
      current_task_id: null,
      tasks: tasks || [],
      options: { mode: mode || "autonomous", max_parallel: 1, project_path: projectPath || null },
    };

    // Write dispatch state file
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

    // Also sync to daemon SQLite so Recent Missions shows it
    if (tracker) {
      try {
        const project = tracker.createProject({
          name: mission.slice(0, 80),
          path: projectPath || null,
          spec: mission,
        });
        const phase = tracker.createPhase({ project_id: project.id, name: "Phase 1" });
        const dbMission = tracker.createMission({ phase_id: phase.id, name: mission.slice(0, 100) });
        if (dbMission) {
          for (const task of (tasks || [])) {
            tracker.createTask({
              mission_id: dbMission.id,
              name: task.title || task.name || "Task",
              description: task.description || "",
              agent_type: task.type || null,
            });
          }
        }
      } catch {
        // SQLite sync is best-effort — don't fail the dispatch start
      }
    }

    res.json({ ok: true, mission_id: missionId });
  });

  return router;
}
