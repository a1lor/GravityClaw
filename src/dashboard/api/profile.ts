import type { Request, Response } from "express";
import { getAllProfile, setProfileValue } from "../../memory/profile.js";

export function getProfile(_req: Request, res: Response) {
  try {
    const profile = getAllProfile();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

const EDITABLE_PROFILE_KEYS = new Set([
  'name', 'occupation', 'location', 'education', 'timezone',
  'availability', 'tech_stack', 'cv_skills', 'background', 'style', 'signature',
])

export function patchProfile(req: Request, res: Response) {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "body must be a JSON object" });
    }
    for (const [key, value] of Object.entries(body)) {
      if (!EDITABLE_PROFILE_KEYS.has(key)) continue;
      setProfileValue(key, String(value ?? ""));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
