import { expect } from "chai";
import { ZipFile } from "yazl";
import {
    ArchiveValidationError,
    validateAgentSkillArchive
} from "../skills/archive.js";
import { AgentSkillArchiveLimits } from "../skills/types.js";

const limits: AgentSkillArchiveLimits = {
    maxCompressedBytes: 1024 * 1024,
    maxUncompressedBytes: 2 * 1024 * 1024,
    maxEntries: 16,
    maxPathLength: 120,
    maxNestingDepth: 5,
    maxSkillMarkdownBytes: 64 * 1024
};

async function zip(
    entries: Array<{ name: string; content: string; mode?: number }>
): Promise<Buffer> {
    const archive = new ZipFile();
    for (const entry of entries) {
        archive.addBuffer(Buffer.from(entry.content), entry.name, {
            ...(entry.mode ? { mode: entry.mode } : {})
        });
    }
    archive.end();
    const chunks: Buffer[] = [];
    for await (const chunk of archive.outputStream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

function corruptCentralDirectoryCrc(archive: Buffer): Buffer {
    const corrupted = Buffer.from(archive);
    const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    const offset = corrupted.indexOf(signature);
    if (offset < 0) throw new Error("central directory not found");
    corrupted.writeUInt32LE(
        (corrupted.readUInt32LE(offset + 16) ^ 0xffffffff) >>> 0,
        offset + 16
    );
    return corrupted;
}

const skillMarkdown = `---
name: useful-skill
description: A useful test skill
---

# Useful skill

Follow these instructions.
`;
const systemSkillMarkdown = skillMarkdown.replace(
    "name: useful-skill",
    "name: system-useful-skill"
);
function skillMarkdownNamed(name: string): string {
    return `---\nname: ${name}\ndescription: Test skill\n---\n\n# Test\n`;
}

async function expectInvalid(
    archive: Buffer,
    scope: "system" | "user",
    message: string,
    customLimits = limits
) {
    let error: unknown;
    try {
        await validateAgentSkillArchive(archive, scope, customLimits);
    } catch (caught) {
        error = caught;
    }
    expect(error).to.be.instanceOf(ArchiveValidationError);
    expect((error as Error).message).to.include(message);
}

describe("Agent Skill ZIP validation", () => {
    it("derives trusted metadata and checksum from a valid user archive", async () => {
        const bytes = await zip([
            { name: "SKILL.md", content: skillMarkdown },
            { name: "references/guide.md", content: "# Guide\n" }
        ]);
        const result = await validateAgentSkillArchive(bytes, "user", limits);
        expect(result.name).to.equal("useful-skill");
        expect(result.description).to.equal("A useful test skill");
        expect(result.checksum).to.match(/^[0-9a-f]{64}$/);
    });

    it("enforces deterministic namespace naming rules and reserved runtime names", async () => {
        const maxName = "a".repeat(46);
        expect(
            (
                await validateAgentSkillArchive(
                    await zip([
                        {
                            name: "SKILL.md",
                            content: skillMarkdownNamed(maxName)
                        }
                    ]),
                    "user",
                    limits
                )
            ).name
        ).to.equal(maxName);
        await expectInvalid(
            await zip([
                {
                    name: "SKILL.md",
                    content: skillMarkdownNamed("a".repeat(47))
                }
            ]),
            "user",
            "1-46"
        );
        await expectInvalid(
            await zip([
                {
                    name: "SKILL.md",
                    content: skillMarkdownNamed("system-private")
                }
            ]),
            "user",
            "must not start with system-"
        );
        await expectInvalid(
            await zip([
                {
                    name: "SKILL.md",
                    content: skillMarkdownNamed("missing-prefix")
                }
            ]),
            "system",
            "must start with system-"
        );
        for (const reserved of ["capture-workflow", "magda-mgd"]) {
            await expectInvalid(
                await zip([
                    {
                        name: "SKILL.md",
                        content: skillMarkdownNamed(reserved)
                    }
                ]),
                "user",
                "reserved"
            );
        }
    });

    it("allows approved system scripts but not arbitrary binary types", async () => {
        const valid = await zip([
            { name: "SKILL.md", content: systemSkillMarkdown },
            { name: "scripts/check.sh", content: "#!/bin/sh\nexit 0\n" }
        ]);
        expect(
            (await validateAgentSkillArchive(valid, "system", limits)).name
        ).to.equal("system-useful-skill");

        await expectInvalid(
            await zip([
                { name: "SKILL.md", content: systemSkillMarkdown },
                { name: "payload.bin", content: "binary" }
            ]),
            "system",
            "unapproved file type"
        );
    });

    it("enforces Markdown-only user archives", async () => {
        await expectInvalid(
            await zip([
                { name: "SKILL.md", content: skillMarkdown },
                { name: "script.sh", content: "exit 0" }
            ]),
            "user",
            "Markdown files only"
        );
    });

    it("requires one root SKILL.md with valid DSH frontmatter and body", async () => {
        await expectInvalid(
            await zip([{ name: "README.md", content: "# Missing" }]),
            "user",
            "must contain SKILL.md"
        );
        await expectInvalid(
            await zip([
                {
                    name: "SKILL.md",
                    content: "---\nname: Bad Name\ndescription: test\n---\nbody"
                }
            ]),
            "user",
            "name must be"
        );
        await expectInvalid(
            await zip([
                {
                    name: "SKILL.md",
                    content: "---\nname: valid\ndescription: test\n---\n"
                }
            ]),
            "user",
            "Markdown body"
        );
    });

    it("rejects traversal paths even when the ZIP central directory is forged", async () => {
        const archive = await zip([
            { name: "SKILL.md", content: skillMarkdown },
            { name: "safe.md", content: "unsafe" }
        ]);
        const forged = Buffer.from(archive);
        const from = Buffer.from("safe.md");
        const to = Buffer.from("../x.md");
        let replacements = 0;
        for (let offset = 0; ; ) {
            const index = forged.indexOf(from, offset);
            if (index < 0) break;
            to.copy(forged, index);
            replacements += 1;
            offset = index + to.length;
        }
        expect(replacements).to.be.greaterThan(1);
        await expectInvalid(forged, "user", "ZIP archive");
    });

    it("rejects an entry whose central-directory CRC is corrupt", async () => {
        await expectInvalid(
            corruptCentralDirectoryCrc(
                await zip([{ name: "SKILL.md", content: skillMarkdown }])
            ),
            "user",
            "CRC checksum mismatch"
        );
    });

    it("rejects case-folded duplicate paths", async () => {
        await expectInvalid(
            await zip([
                { name: "SKILL.md", content: skillMarkdown },
                { name: "Guide.md", content: "one" },
                { name: "guide.md", content: "two" }
            ]),
            "user",
            "duplicate entry paths"
        );
    });

    it("rejects symlinks and other non-regular entries", async () => {
        await expectInvalid(
            await zip([
                { name: "SKILL.md", content: skillMarkdown },
                { name: "link.md", content: "target", mode: 0o120777 }
            ]),
            "user",
            "links and special files"
        );
    });

    it("enforces entry, path, compressed and uncompressed limits", async () => {
        const twoEntries = await zip([
            { name: "SKILL.md", content: skillMarkdown },
            { name: "extra.md", content: "extra" }
        ]);
        await expectInvalid(twoEntries, "user", "too many entries", {
            ...limits,
            maxEntries: 1
        });
        await expectInvalid(twoEntries, "user", "compressed size", {
            ...limits,
            maxCompressedBytes: twoEntries.length - 1
        });
        await expectInvalid(twoEntries, "user", "uncompressed size", {
            ...limits,
            maxUncompressedBytes: 10,
            maxSkillMarkdownBytes: 10
        });
        await expectInvalid(
            await zip([
                { name: "SKILL.md", content: skillMarkdown },
                { name: "a/b/c/d/e/f.md", content: "deep" }
            ]),
            "user",
            "nesting depth"
        );
    });
});
