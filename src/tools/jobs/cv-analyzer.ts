import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const PDFParse = require("pdf-parse");
import { getProfileValue, setProfileValue } from "../../memory/profile.js";
import { chat } from "../../llm/llm.js";

/**
 * Analyzes the user's CV once and populates all profile fields.
 * Only fills fields that are not already set — never overwrites manual entries.
 * Guard: "cv_profile_extracted" flag in profile prevents re-running.
 */
export async function analyzeCvOnce(): Promise<void> {
    const cvPath = getProfileValue("cv_path");
    if (!cvPath) return;

    // Already fully extracted — skip
    if (getProfileValue("cv_profile_extracted")) return;

    console.log(`📄 Extracting profile from CV at ${cvPath}…`);

    try {
        if (!fs.existsSync(cvPath)) {
            console.warn("⚠️ CV file missing despite path in profile.");
            return;
        }

        const dataBuffer = fs.readFileSync(cvPath);

        let text = "";
        if (cvPath.toLowerCase().endsWith(".pdf")) {
            const data = await PDFParse(dataBuffer);
            text = data.text;
        } else {
            text = dataBuffer.toString("utf-8").slice(0, 5000);
        }

        if (!text.trim()) {
            console.warn("⚠️ Empty CV text extracted.");
            return;
        }

        const { message } = await chat([{
            role: "user",
            content:
                `Extract the following fields from this CV and respond with ONLY a valid JSON object — no explanation, no markdown, no code fences:\n\n` +
                `{\n` +
                `  "name": "full name of the candidate (string or null)",\n` +
                `  "occupation": "their current job title or professional role (string or null)",\n` +
                `  "location": "city and/or country (string or null)",\n` +
                `  "projects": "1-2 sentence summary of their most notable projects (string or null)",\n` +
                `  "background": "2-3 sentence summary of education and experience (string or null)",\n` +
                `  "cv_skills": "comma-separated list of core technical skills (string or null)"\n` +
                `}\n\n` +
                `CV:\n${text.slice(0, 10000)}`,
        }]);

        const raw = message.content ?? "";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn("⚠️ CV extraction: no JSON found in LLM response.");
            return;
        }

        const extracted: Record<string, string | null> = JSON.parse(jsonMatch[0]);

        let fieldsSet = 0;
        for (const [key, value] of Object.entries(extracted)) {
            if (!value) continue;
            // Only fill empty profile fields — never overwrite manual entries
            if (!getProfileValue(key)) {
                setProfileValue(key, value);
                fieldsSet++;
            }
        }

        setProfileValue("cv_profile_extracted", "1");
        console.log(`✅ CV extraction complete — ${fieldsSet} profile fields populated.`);
    } catch (err) {
        console.error("❌ CV analysis failed:", err);
    }
}
