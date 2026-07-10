import { expect } from "chai";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    installSkill,
    uninstallSkill,
    resolveSkillDir,
    parseAgents,
    packageSkillsDir,
    AGENT_NAMES
} from "../skills.js";
import { UsageError } from "../errors.js";

const SKILLS_DIR = fileURLToPath(new URL("../../skills/", import.meta.url));
const BUNDLE = ["SKILL.md", "mgd-workflows.md", "dataset-elicitation.md"];

describe("skills install", () => {
    let tmp: string;
    let env: NodeJS.ProcessEnv;
    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mgd-test-"));
        env = {
            HOME: tmp,
            CODEX_HOME: path.join(tmp, "codexhome"),
            XDG_CONFIG_HOME: path.join(tmp, "xdg")
        };
    });
    afterEach(async () => {
        await fs.rm(tmp, { recursive: true, force: true });
    });

    it("packageSkillsDir finds the shipped skills folder", () => {
        expect(existsSync(path.join(packageSkillsDir(), "SKILL.md"))).to.equal(
            true
        );
    });

    it("resolveSkillDir: global dirs honour env overrides", () => {
        expect(
            resolveSkillDir({
                agent: "claude",
                scope: "global",
                projectDir: tmp,
                env
            })
        ).to.equal(path.join(tmp, ".claude", "skills", "magda-mgd"));
        expect(
            resolveSkillDir({
                agent: "codex",
                scope: "global",
                projectDir: tmp,
                env
            })
        ).to.equal(path.join(tmp, "codexhome", "skills", "magda-mgd"));
        expect(
            resolveSkillDir({
                agent: "opencode",
                scope: "global",
                projectDir: tmp,
                env
            })
        ).to.equal(path.join(tmp, "xdg", "opencode", "skills", "magda-mgd"));
    });

    it("resolveSkillDir: project dirs are per-tool", () => {
        const proj = path.join(tmp, "proj");
        expect(
            resolveSkillDir({
                agent: "claude",
                scope: "project",
                projectDir: proj,
                env
            })
        ).to.equal(path.join(proj, ".claude", "skills", "magda-mgd"));
        expect(
            resolveSkillDir({
                agent: "codex",
                scope: "project",
                projectDir: proj,
                env
            })
        ).to.equal(path.join(proj, ".agents", "skills", "magda-mgd"));
        expect(
            resolveSkillDir({
                agent: "opencode",
                scope: "project",
                projectDir: proj,
                env
            })
        ).to.equal(path.join(proj, ".opencode", "skills", "magda-mgd"));
    });

    it("installs the bundle globally for each agent", async () => {
        for (const agent of AGENT_NAMES) {
            const res = await installSkill({
                agent,
                scope: "global",
                projectDir: tmp,
                skillsDir: SKILLS_DIR,
                env
            });
            expect(res.action).to.equal("created");
            expect(res.scope).to.equal("global");
            expect(res.files).to.deep.equal(BUNDLE);
            for (const f of BUNDLE) {
                expect(existsSync(path.join(res.dir, f))).to.equal(true);
            }
        }
    });

    it("installs the bundle into a project dir", async () => {
        const proj = path.join(tmp, "proj");
        const res = await installSkill({
            agent: "codex",
            scope: "project",
            projectDir: proj,
            skillsDir: SKILLS_DIR,
            env
        });
        expect(res.dir).to.equal(
            path.join(proj, ".agents", "skills", "magda-mgd")
        );
        expect(existsSync(path.join(res.dir, "SKILL.md"))).to.equal(true);
    });

    it("is idempotent: second install reports updated, files intact", async () => {
        const first = await installSkill({
            agent: "claude",
            scope: "global",
            projectDir: tmp,
            skillsDir: SKILLS_DIR,
            env
        });
        expect(first.action).to.equal("created");
        const second = await installSkill({
            agent: "claude",
            scope: "global",
            projectDir: tmp,
            skillsDir: SKILLS_DIR,
            env
        });
        expect(second.action).to.equal("updated");
        for (const f of BUNDLE) {
            expect(existsSync(path.join(second.dir, f))).to.equal(true);
        }
    });

    it("uninstall removes the folder, then is a no-op", async () => {
        await installSkill({
            agent: "opencode",
            scope: "global",
            projectDir: tmp,
            skillsDir: SKILLS_DIR,
            env
        });
        const first = await uninstallSkill({
            agent: "opencode",
            scope: "global",
            projectDir: tmp,
            env
        });
        expect(first.action).to.equal("removed");
        expect(existsSync(first.dir)).to.equal(false);
        const second = await uninstallSkill({
            agent: "opencode",
            scope: "global",
            projectDir: tmp,
            env
        });
        expect(second.action).to.equal("absent");
    });

    it("parseAgents: default all, single, and bad value", () => {
        expect(parseAgents(undefined)).to.deep.equal([...AGENT_NAMES]);
        expect(parseAgents("codex")).to.deep.equal(["codex"]);
        expect(() => parseAgents("cursor")).to.throw(UsageError);
    });
});
