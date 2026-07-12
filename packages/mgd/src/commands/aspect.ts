import { Command } from "commander";
import { clientFromProfile } from "../client.js";
import { REGISTRY_ASPECTS, registryAspect } from "../endpoints.js";
import { parseAspectValue } from "../recordBuilders.js";
import { note, printData, resolveMode } from "../output.js";

export function registerAspectCommands(program: Command): void {
    const aspect = program
        .command("aspect")
        .description("Registry aspect definitions");

    aspect
        .command("list")
        .option("--json", "output JSON")
        .option("--jsonl", "one definition per line")
        .action(async (opts) => {
            const client = await clientFromProfile();
            const defs = await client.json<any[]>("GET", REGISTRY_ASPECTS);
            const mode = resolveMode(opts);
            if (mode === "human") {
                for (const d of defs) {
                    process.stdout.write(`${d.id}\t${d.name}\n`);
                }
            } else {
                printData(mode, defs);
            }
        });

    aspect
        .command("get <id>")
        .option("--json", "output JSON (default)")
        .action(async (id: string) => {
            const client = await clientFromProfile();
            printData("json", await client.json("GET", registryAspect(id)));
        });

    aspect
        .command("create <id>")
        .description("Create or update an aspect definition with a JSON schema")
        .requiredOption("--name <name>", "human-readable aspect name")
        .requiredOption(
            "--schema <schema>",
            "JSON schema: inline JSON, @file.json, or -"
        )
        .option("--json", "output the result as JSON")
        .action(async (id: string, opts) => {
            const client = await clientFromProfile();
            const jsonSchema = await parseAspectValue(opts.schema);
            await client.json("PUT", registryAspect(id), {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id, name: opts.name, jsonSchema })
            });
            if (opts.json) printData("json", { aspectId: id, ok: true });
            else note(`Aspect definition "${id}" saved.`);
        });
}
