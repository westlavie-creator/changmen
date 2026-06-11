"use strict";

const { getMatcherStatus, fetchMatcherDashboard } = require("./matcher_data");
const { logMatcherApiOk, logMatcherApiWarn, logMatcherApiErr } = require("./matcher_api_log");
const { startMatcherProcess, stopMatcherProcess } = require("./matcher_process");

function registerMatcherApiRoutes(app, supabase) {
  app.get("/api/link-preview", async (req, res) => {
    try {
      const { previewLinkAlignment } = require("../link");
      const result = await previewLinkAlignment(supabase, {
        platform: req.query.platform,
        sourceMatchId: req.query.sourceMatchId,
        clientMatchId: req.query.clientMatchId,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/link-platform-preview", async (req, res) => {
    try {
      const { previewLinkPlatformAlignment } = require("../link");
      const result = await previewLinkPlatformAlignment(supabase, {
        platform: req.query.platform,
        sourceMatchId: req.query.sourceMatchId,
        targetPlatform: req.query.targetPlatform,
        targetMatchId: req.query.targetMatchId,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/link-match", async (req, res) => {
    try {
      const { platform, sourceMatchId, clientMatchId, reversed } = req.body || {};
      const { linkPlatformToClientMatch } = require("../link");
      const result = await linkPlatformToClientMatch(supabase, {
        platform,
        sourceMatchId,
        clientMatchId,
        reversed: typeof reversed === "boolean" ? reversed : undefined,
      });
      logMatcherApiOk("/api/link-match", result);
      res.json(result);
    } catch (err) {
      logMatcherApiErr("/api/link-match", err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/link-platform-match", async (req, res) => {
    try {
      const { platform, sourceMatchId, targetPlatform, targetMatchId, reversed } = req.body || {};
      const { linkPlatformToPlatform } = require("../link");
      const result = await linkPlatformToPlatform(supabase, {
        platform,
        sourceMatchId,
        targetPlatform,
        targetMatchId,
        reversed: typeof reversed === "boolean" ? reversed : undefined,
      });
      logMatcherApiOk("/api/link-platform-match", result);
      res.json(result);
    } catch (err) {
      logMatcherApiErr("/api/link-platform-match", err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/link-team-preview", async (req, res) => {
    try {
      const { previewLinkPlatformTeams } = require("../link");
      const result = await previewLinkPlatformTeams(supabase, {
        a: {
          platform: req.query.platformA,
          platformId: req.query.platformIdA,
          platformName: req.query.platformNameA,
          gameCode: req.query.gameCode,
        },
        b: {
          platform: req.query.platformB,
          platformId: req.query.platformIdB,
          platformName: req.query.platformNameB,
          gameCode: req.query.gameCode,
        },
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/link-team", async (req, res) => {
    try {
      const { a, b } = req.body || {};
      const { linkPlatformTeams } = require("../link");
      const result = await linkPlatformTeams(supabase, { a, b });
      logMatcherApiOk("/api/link-team", result);
      res.json(result);
    } catch (err) {
      logMatcherApiErr("/api/link-team", err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/register-team-map", async (req, res) => {
    try {
      const { platform, platformId, platformName, gameCode } = req.body || {};
      const { registerTeamPlatformMap } = require("../link");
      const result = await registerTeamPlatformMap(supabase, {
        platform,
        platformId,
        platformName,
        gameCode,
      });
      logMatcherApiOk("/api/register-team-map", result);
      res.json(result);
    } catch (err) {
      const label = err.code === "already_registered" ? "skip" : "error";
      if (label === "skip") logMatcherApiWarn("/api/register-team-map", err, "skip");
      else logMatcherApiErr("/api/register-team-map", err);
      res.status(err.code === "already_registered" ? 409 : 400).json({
        ok: false,
        error: err.message,
        code: err.code || "register_failed",
      });
    }
  });

  app.delete("/api/client-match/:id", async (req, res) => {
    try {
      const { deleteClientMatch } = require("../ops/delete_client_match");
      const result = await deleteClientMatch(supabase, req.params.id);
      logMatcherApiOk("/api/client-match", result);
      res.json(result);
    } catch (err) {
      logMatcherApiErr("/api/client-match", err);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/merge-preview", async (req, res) => {
    try {
      const { previewMergeClientMatches } = require("../ops/merge_client_matches");
      const result = await previewMergeClientMatches(supabase, {
        sourceClientMatchId: req.query.sourceClientMatchId,
        targetClientMatchId: req.query.targetClientMatchId,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/merge-client-matches", async (req, res) => {
    try {
      const { sourceClientMatchId, targetClientMatchId } = req.body || {};
      const { mergeClientMatches } = require("../ops/merge_client_matches");
      const result = await mergeClientMatches(supabase, {
        sourceClientMatchId,
        targetClientMatchId,
      });
      res.json(result);
    } catch (err) {
      console.error("[matcher] /api/merge-client-matches error:", err.message);
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/data", async (req, res) => {
    try {
      res.json(await fetchMatcherDashboard(supabase));
    } catch (err) {
      console.error("[matcher] /api/data error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/matcher-status", async (req, res) => {
    try {
      res.json(await getMatcherStatus(supabase));
    } catch (err) {
      res.status(500).json({ running: false, error: err.message });
    }
  });

  app.post("/api/matcher/start", async (req, res) => {
    try {
      const result = await startMatcherProcess();
      if (!result.ok) return res.status(409).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post("/api/matcher/stop", async (req, res) => {
    try {
      const result = await stopMatcherProcess();
      if (!result.ok) return res.status(409).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/debug", async (req, res) => {
    const { data, error } = await supabase
      .from("platform_matches")
      .select("platform, source_match_id, start_time, home, away, synced_at");
    if (error) return res.json({ error: error.message });
    const summary = {};
    for (const r of data || []) {
      if (!summary[r.platform]) summary[r.platform] = { count: 0, sample: [] };
      summary[r.platform].count++;
      if (summary[r.platform].sample.length < 2) {
        summary[r.platform].sample.push({ home: r.home, away: r.away, start_time: r.start_time });
      }
    }
    res.json({ total: (data || []).length, byPlatform: summary });
  });
}

module.exports = { registerMatcherApiRoutes };
