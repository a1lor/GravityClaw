/**
 * local.ts — PC mode launcher
 *
 * 1. If RAILWAY_TOKEN + RAILWAY_SERVICE_ID are set, scales the Railway
 *    service to 0 replicas (pausing it) before starting the local bot.
 * 2. Starts the bot locally via `npm run dev`.
 * 3. On exit (Ctrl+C), scales Railway back to 1 replica automatically.
 *
 * This ensures you're never burning tokens on both Railway and your
 * local machine at the same time.
 */

import { spawn } from "child_process";
import "dotenv/config";

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN ?? "";
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID ?? "";
const RAILWAY_ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID ?? "production";
const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

const hasRailway = Boolean(RAILWAY_TOKEN && RAILWAY_SERVICE_ID);

// ── Railway GraphQL helper ────────────────────────────
async function railwayScale(replicas: number): Promise<void> {
    if (!hasRailway) return;

    const query = `
        mutation ScaleService($serviceId: String!, $environmentId: String!) {
            serviceInstanceUpdate(
                serviceId: $serviceId
                environmentId: $environmentId
                input: { numReplicas: ${replicas} }
            )
        }
    `;

    try {
        const res = await fetch(RAILWAY_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${RAILWAY_TOKEN}`,
            },
            body: JSON.stringify({
                query,
                variables: {
                    serviceId: RAILWAY_SERVICE_ID,
                    environmentId: RAILWAY_ENVIRONMENT_ID,
                },
            }),
        });

        const data = (await res.json()) as { errors?: { message: string }[] };
        if (data.errors?.length) {
            console.warn(`⚠️  Railway API: ${data.errors[0].message}`);
        }
    } catch (err) {
        console.warn("⚠️  Could not reach Railway API:", (err as Error).message);
    }
}

// ── Main ─────────────────────────────────────────────
async function main(): Promise<void> {
    console.log("\n🏠 Gravity Claw — Local Mode\n");

    if (hasRailway) {
        process.stdout.write("☁️  Pausing Railway service… ");
        await railwayScale(0);
        console.log("done ✓");
        console.log("   (Railway will resume automatically when you exit)\n");
    } else {
        console.log("ℹ️  No RAILWAY_TOKEN set — starting local only.\n");
    }

    // Spawn the bot process
    const child = spawn("npm", ["run", "dev"], {
        stdio: "inherit",
        shell: true,
    });

    let cleaningUp = false;

    const cleanup = async (signal: string): Promise<void> => {
        if (cleaningUp) return;
        cleaningUp = true;

        console.log(`\n🛑 ${signal} — shutting down local instance…`);
        child.kill("SIGTERM");

        if (hasRailway) {
            process.stdout.write("☁️  Resuming Railway service… ");
            await railwayScale(1);
            console.log("done ✓");
        }

        process.exit(0);
    };

    process.on("SIGINT", () => void cleanup("SIGINT"));
    process.on("SIGTERM", () => void cleanup("SIGTERM"));
}

main().catch(console.error);
