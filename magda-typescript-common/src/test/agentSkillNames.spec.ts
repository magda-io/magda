import { expect } from "chai";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    RESERVED_RUNTIME_SKILL_NAMES,
    isReservedAgentSkillName
} from "../agentSkillNames.js";

const runtimeSkillsDirectory = fileURLToPath(
    new URL("../../../magda-agent-runtime/skills/", import.meta.url)
);
const mgdSkillMarkdown = fileURLToPath(
    new URL("../../../packages/mgd/skills/SKILL.md", import.meta.url)
);

async function skillName(file: string, label: string): Promise<string> {
    const markdown = await fs.readFile(file, "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
        markdown
    )?.[1];
    expect(frontmatter, `${label} frontmatter`).to.be.a("string");
    const name = /^name:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/m.exec(
        frontmatter!
    )?.[1];
    expect(name, `${label} name`).to.be.a("string");
    return name!;
}

async function runtimeBundledSkillNames(): Promise<string[]> {
    const names: string[] = [];
    for (const entry of await fs.readdir(runtimeSkillsDirectory, {
        withFileTypes: true
    })) {
        if (!entry.isDirectory()) continue;
        names.push(
            await skillName(
                path.join(runtimeSkillsDirectory, entry.name, "SKILL.md"),
                `${entry.name}/SKILL.md`
            )
        );
    }
    return names.sort();
}

describe("reserved runtime Agent Skill names", () => {
    it("reserves every image-bundled skill and separately installed magda-mgd", async () => {
        const bundledNames = await runtimeBundledSkillNames();
        expect(bundledNames).to.include.members([
            "capture-workflow",
            "python-dependencies"
        ]);
        const separatelyInstalledName = await skillName(
            mgdSkillMarkdown,
            "packages/mgd/skills/SKILL.md"
        );
        expect(separatelyInstalledName).to.equal("magda-mgd");
        for (const name of [...bundledNames, separatelyInstalledName]) {
            expect(isReservedAgentSkillName(name), name).to.equal(true);
            expect(RESERVED_RUNTIME_SKILL_NAMES.has(name), name).to.equal(true);
        }
    });

    it("reserves the DSH Office skills mounted by the managed profile", async () => {
        const profile = await fs.readFile(
            fileURLToPath(
                new URL(
                    "../../../magda-agent-runtime/magda.cordis.patch.yml",
                    import.meta.url
                )
            ),
            "utf8"
        );
        expect(profile).to.include("name: '@deepseek-ai/dsh-skill-office'");
        for (const name of ["office-docx", "office-pptx", "office-xlsx"]) {
            expect(isReservedAgentSkillName(name), name).to.equal(true);
        }
    });

    it("does not reserve the future naming prefix before it is adopted", () => {
        expect(isReservedAgentSkillName("magda-builtin-example")).to.equal(
            false
        );
    });
});
