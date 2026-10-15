import { expect } from "chai";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ZipFile } from "yazl";
import {
    AgentSkillArchiveError,
    DEFAULT_AGENT_SKILL_ARCHIVE_LIMITS,
    createAgentSkillArchive,
    extractAgentSkillArchiveAtomically,
    parseAgentSkillMarkdown,
    validateAgentSkillArchive,
    validateAgentSkillDirectory
} from "../agentSkillArchive.js";
import type { AgentSkillArchiveLimits } from "../agentSkillArchive.js";

const TEST_LIMITS: AgentSkillArchiveLimits = {
    maxCompressedBytes: 1024 * 1024,
    maxUncompressedBytes: 2 * 1024 * 1024,
    maxEntries: 32,
    maxPathLength: 120,
    maxNestingDepth: 5,
    maxSkillMarkdownBytes: 64 * 1024
};

const userSkill = `---
name: useful-skill
description: A useful test skill
---

# Useful skill

Follow these instructions.
`;
const systemSkill = userSkill.replace(
    "name: useful-skill",
    "name: system-useful-skill"
);

async function zip(
    entries: Array<{
        name: string;
        content?: Buffer | string;
        mode?: number;
        directory?: boolean;
    }>
): Promise<Buffer> {
    const archive = new ZipFile();
    const mtime = new Date(1980, 0, 1);
    for (const entry of entries) {
        if (entry.directory) {
            archive.addEmptyDirectory(entry.name, {
                mtime,
                ...(entry.mode === undefined ? {} : { mode: entry.mode })
            });
        } else {
            const content = entry.content ?? "";
            archive.addBuffer(
                Buffer.isBuffer(content) ? content : Buffer.from(content),
                entry.name,
                {
                    mtime,
                    ...(entry.mode === undefined ? {} : { mode: entry.mode })
                }
            );
        }
    }
    archive.end();
    const chunks: Buffer[] = [];
    for await (const chunk of archive.outputStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

function forEachZipHeader(
    archive: Buffer,
    callback: (result: Buffer, offset: number, central: boolean) => void
): Buffer {
    const result = Buffer.from(archive);
    const local = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const central = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    for (const [signature, isCentral] of [
        [local, false],
        [central, true]
    ] as const) {
        for (let cursor = 0; ; ) {
            const offset = result.indexOf(signature, cursor);
            if (offset < 0) break;
            callback(result, offset, isCentral);
            cursor = offset + signature.length;
        }
    }
    return result;
}

function replaceAllSameLength(
    archive: Buffer,
    original: string,
    replacement: Buffer | string
): Buffer {
    const result = Buffer.from(archive);
    const from = Buffer.from(original);
    const to = Buffer.isBuffer(replacement)
        ? replacement
        : Buffer.from(replacement);
    if (from.length !== to.length)
        throw new Error("replacement length differs");
    let count = 0;
    for (let cursor = 0; ; ) {
        const offset = result.indexOf(from, cursor);
        if (offset < 0) break;
        to.copy(result, offset);
        cursor = offset + to.length;
        count += 1;
    }
    if (count < 2) throw new Error("ZIP name was not found in both headers");
    return result;
}

async function expectInvalid(
    operation: Promise<unknown>,
    message: string
): Promise<void> {
    let error: unknown;
    try {
        await operation;
    } catch (caught) {
        error = caught;
    }
    expect(error).to.be.instanceOf(AgentSkillArchiveError);
    expect((error as Error).message).to.include(message);
}

async function writeSkill(
    root: string,
    markdown = userSkill,
    supporting: Record<string, Buffer | string> = {
        "references/guide.md": "# Guide\n"
    }
): Promise<void> {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, "SKILL.md"), markdown);
    for (const [relative, content] of Object.entries(supporting)) {
        const destination = path.join(root, ...relative.split("/"));
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, content);
    }
}

describe("Agent Skill archive", () => {
    let temporaryDirectory: string;

    beforeEach(async () => {
        temporaryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), "mgd-agent-skill-")
        );
    });

    afterEach(async () => {
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    });

    it("exposes the Stage-1 defaults and parses trusted frontmatter/body", () => {
        expect(DEFAULT_AGENT_SKILL_ARCHIVE_LIMITS).to.deep.equal({
            maxCompressedBytes: 8 * 1024 * 1024,
            maxUncompressedBytes: 32 * 1024 * 1024,
            maxEntries: 256,
            maxPathLength: 240,
            maxNestingDepth: 8,
            maxSkillMarkdownBytes: 1024 * 1024
        });
        const parsed = parseAgentSkillMarkdown(userSkill);
        expect(parsed.name).to.equal("useful-skill");
        expect(parsed.description).to.equal("A useful test skill");
        expect(parsed.body).to.include("# Useful skill");
    });

    it("validates a local directory and creates byte-for-byte deterministic ZIPs", async () => {
        const source = path.join(temporaryDirectory, "source");
        await writeSkill(source);

        const first = await createAgentSkillArchive(
            source,
            "user",
            TEST_LIMITS
        );
        await fs.utimes(path.join(source, "SKILL.md"), new Date(), new Date());
        const second = await createAgentSkillArchive(
            source,
            "user",
            TEST_LIMITS
        );

        expect(second.bytes.equals(first.bytes)).to.equal(true);
        expect(first.entries).to.deep.equal([
            "SKILL.md",
            "references/guide.md"
        ]);
        expect(first.archiveSha256).to.match(/^[0-9a-f]{64}$/);
        expect(first.treeDigest).to.match(/^[0-9a-f]{64}$/);
        const validated = await validateAgentSkillArchive(
            first.bytes,
            "user",
            TEST_LIMITS
        );
        expect(validated).to.deep.include({
            name: "useful-skill",
            description: "A useful test skill",
            archiveSha256: first.archiveSha256,
            treeDigest: first.treeDigest
        });
    });

    it("enforces names, namespace prefixes, reserved names, and Markdown-only user trees", async () => {
        const named = (name: string) =>
            `---\nname: ${name}\ndescription: Test skill\n---\n\n# Test\n`;
        expect(
            (
                await validateAgentSkillArchive(
                    await zip([
                        { name: "SKILL.md", content: named("a".repeat(46)) }
                    ]),
                    "user",
                    TEST_LIMITS
                )
            ).name
        ).to.equal("a".repeat(46));
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: named("a".repeat(47)) }
                ]),
                "user",
                TEST_LIMITS
            ),
            "1-46"
        );
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: named("system-private") }
                ]),
                "user",
                TEST_LIMITS
            ),
            "must not start"
        );
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: named("missing-prefix") }
                ]),
                "system",
                TEST_LIMITS
            ),
            "must start"
        );
        for (const reserved of ["capture-workflow", "magda-mgd"]) {
            await expectInvalid(
                validateAgentSkillArchive(
                    await zip([{ name: "SKILL.md", content: named(reserved) }]),
                    "user",
                    TEST_LIMITS
                ),
                "reserved"
            );
        }
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: userSkill },
                    { name: "scripts/run.sh", content: "exit 0" }
                ]),
                "user",
                TEST_LIMITS
            ),
            "Markdown files only"
        );
    });

    it("allows system resources, preserves safe executable bits, and keeps user Markdown non-executable", async () => {
        const source = path.join(temporaryDirectory, "system-source");
        await writeSkill(source, systemSkill, {
            "scripts/run.sh": "#!/bin/sh\nexit 0\n",
            "models/data.bin": Buffer.from([0, 1, 2])
        });
        await fs.chmod(path.join(source, "scripts/run.sh"), 0o755);
        const created = await createAgentSkillArchive(
            source,
            "system",
            TEST_LIMITS
        );
        const result = await validateAgentSkillArchive(
            created.bytes,
            "system",
            TEST_LIMITS
        );
        expect(result.name).to.equal("system-useful-skill");
        const systemDestination = path.join(
            temporaryDirectory,
            "system-extract"
        );
        await extractAgentSkillArchiveAtomically(
            created.bytes,
            "system",
            systemDestination,
            TEST_LIMITS
        );
        expect(
            (await fs.stat(path.join(systemDestination, "scripts/run.sh")))
                .mode & 0o777
        ).to.equal(0o755);

        const executableUserMarkdown = await zip([
            { name: "SKILL.md", content: userSkill },
            { name: "guide.md", content: "# Guide\n", mode: 0o100755 }
        ]);
        const userDestination = path.join(temporaryDirectory, "user-extract");
        await extractAgentSkillArchiveAtomically(
            executableUserMarkdown,
            "user",
            userDestination,
            TEST_LIMITS
        );
        expect(
            (await fs.stat(path.join(userDestination, "guide.md"))).mode & 0o777
        ).to.equal(0o644);
    });

    it("rejects malformed metadata and a missing root SKILL.md", async () => {
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([{ name: "README.md", content: "# Read me" }]),
                "user",
                TEST_LIMITS
            ),
            "must contain SKILL.md"
        );
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    {
                        name: "SKILL.md",
                        content:
                            "---\nname: Bad Name\ndescription: Test\n---\nbody"
                    }
                ]),
                "user",
                TEST_LIMITS
            ),
            "name must be"
        );
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    {
                        name: "SKILL.md",
                        content: "---\nname: valid\ndescription: Test\n---\n"
                    }
                ]),
                "user",
                TEST_LIMITS
            ),
            "Markdown body"
        );
    });

    it("rejects traversal, absolute, backslash, and NUL entry names", async () => {
        const base = await zip([
            { name: "SKILL.md", content: userSkill },
            { name: "safe.md", content: "# Safe" }
        ]);
        for (const replacement of [
            "../x.md",
            "/bad.md",
            "bad\\.md",
            Buffer.from([0x62, 0x61, 0x64, 0, 0x2e, 0x6d, 0x64])
        ]) {
            await expectInvalid(
                validateAgentSkillArchive(
                    replaceAllSameLength(base, "safe.md", replacement),
                    "user",
                    TEST_LIMITS
                ),
                "entry path"
            );
        }
    });

    it("rejects encrypted entries, links, special files, corrupt CRC, and malformed sizes", async () => {
        const ordinary = await zip([{ name: "SKILL.md", content: userSkill }]);
        const encrypted = forEachZipHeader(
            ordinary,
            (result, offset, central) => {
                const flagOffset = offset + (central ? 8 : 6);
                result.writeUInt16LE(
                    result.readUInt16LE(flagOffset) | 1,
                    flagOffset
                );
            }
        );
        await expectInvalid(
            validateAgentSkillArchive(encrypted, "user", TEST_LIMITS),
            "Encrypted"
        );

        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: userSkill },
                    { name: "link.md", content: "target", mode: 0o120777 }
                ]),
                "user",
                TEST_LIMITS
            ),
            "links and special files"
        );
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: userSkill },
                    { name: "pipe.md", content: "pipe", mode: 0o010644 }
                ]),
                "user",
                TEST_LIMITS
            ),
            "links and special files"
        );
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: userSkill },
                    { name: "setuid.md", content: "unsafe", mode: 0o104755 }
                ]),
                "user",
                TEST_LIMITS
            ),
            "special permission bits"
        );

        const crc = Buffer.from(ordinary);
        const central = crc.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        crc.writeUInt32LE(
            (crc.readUInt32LE(central + 16) ^ 0xffffffff) >>> 0,
            central + 16
        );
        await expectInvalid(
            validateAgentSkillArchive(crc, "user", TEST_LIMITS),
            "CRC"
        );

        const size = Buffer.from(ordinary);
        const sizeCentral = size.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        size.writeUInt32LE(
            size.readUInt32LE(sizeCentral + 24) + 1,
            sizeCentral + 24
        );
        await expectInvalid(
            validateAgentSkillArchive(size, "user", TEST_LIMITS),
            "ZIP archive"
        );
    });

    it("rejects duplicate NFC/case paths and file-directory conflicts", async () => {
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: userSkill },
                    { name: "Guide.md", content: "one" },
                    { name: "guide.md", content: "two" }
                ]),
                "user",
                TEST_LIMITS
            ),
            "duplicate"
        );
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: userSkill },
                    { name: "caf\u00e9.md", content: "one" },
                    { name: "cafe\u0301.md", content: "two" }
                ]),
                "user",
                TEST_LIMITS
            ),
            "duplicate"
        );
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: userSkill },
                    { name: "guide", content: "file" },
                    { name: "guide/page.md", content: "page" }
                ]),
                "system",
                TEST_LIMITS
            ),
            "conflicting"
        );
    });

    it("enforces every resource limit", async () => {
        const twoFiles = await zip([
            { name: "SKILL.md", content: userSkill },
            { name: "extra.md", content: "extra" }
        ]);
        await expectInvalid(
            validateAgentSkillArchive(twoFiles, "user", {
                ...TEST_LIMITS,
                maxCompressedBytes: twoFiles.length - 1
            }),
            "compressed size"
        );
        await expectInvalid(
            validateAgentSkillArchive(twoFiles, "user", {
                ...TEST_LIMITS,
                maxEntries: 1
            }),
            "too many entries"
        );
        await expectInvalid(
            validateAgentSkillArchive(twoFiles, "user", {
                ...TEST_LIMITS,
                maxUncompressedBytes: 10
            }),
            "uncompressed size"
        );
        await expectInvalid(
            validateAgentSkillArchive(twoFiles, "user", {
                ...TEST_LIMITS,
                maxSkillMarkdownBytes: 10
            }),
            "SKILL.md exceeds"
        );
        await expectInvalid(
            validateAgentSkillArchive(twoFiles, "user", {
                ...TEST_LIMITS,
                maxPathLength: 7
            }),
            "overlong"
        );
        await expectInvalid(
            validateAgentSkillArchive(
                await zip([
                    { name: "SKILL.md", content: userSkill },
                    { name: "a/b/c/d/e/f.md", content: "deep" }
                ]),
                "user",
                TEST_LIMITS
            ),
            "nesting depth"
        );
    });

    it("never follows local symlinks", async function () {
        const source = path.join(temporaryDirectory, "source");
        await writeSkill(source);
        try {
            await fs.symlink(
                path.join(source, "SKILL.md"),
                path.join(source, "linked.md")
            );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EPERM") this.skip();
            throw error;
        }
        await expectInvalid(
            validateAgentSkillDirectory(source, "user", TEST_LIMITS),
            "symbolic links"
        );
        await expectInvalid(
            validateAgentSkillDirectory(
                path.join(temporaryDirectory, "root-link"),
                "user",
                TEST_LIMITS
            ),
            "cannot be read"
        );
        await fs.symlink(source, path.join(temporaryDirectory, "root-link"));
        await expectInvalid(
            validateAgentSkillDirectory(
                path.join(temporaryDirectory, "root-link"),
                "user",
                TEST_LIMITS
            ),
            "not a symlink"
        );
    });

    it("validates before atomic extraction and replaces the destination as one tree", async () => {
        const source = path.join(temporaryDirectory, "source");
        const destination = path.join(temporaryDirectory, "installed");
        await writeSkill(source);
        const created = await createAgentSkillArchive(
            source,
            "user",
            TEST_LIMITS
        );
        await fs.mkdir(destination);
        await fs.writeFile(path.join(destination, "stale.md"), "stale");

        const extracted = await extractAgentSkillArchiveAtomically(
            created.bytes,
            "user",
            destination,
            TEST_LIMITS
        );
        expect(extracted.destination).to.equal(path.resolve(destination));
        expect(extracted.treeDigest).to.equal(created.treeDigest);
        expect(
            await fs.readFile(path.join(destination, "SKILL.md"), "utf8")
        ).to.equal(userSkill);
        let staleExists = true;
        try {
            await fs.access(path.join(destination, "stale.md"));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                staleExists = false;
            } else {
                throw error;
            }
        }
        expect(staleExists).to.equal(false);

        const snapshot = await fs.readFile(path.join(destination, "SKILL.md"));
        await expectInvalid(
            extractAgentSkillArchiveAtomically(
                Buffer.from("not a ZIP"),
                "user",
                destination,
                TEST_LIMITS
            ),
            "valid ZIP"
        );
        expect(
            (await fs.readFile(path.join(destination, "SKILL.md"))).equals(
                snapshot
            )
        ).to.equal(true);
    });

    it("rejects a symlinked atomic-extraction parent", async function () {
        const source = path.join(temporaryDirectory, "source-parent-link");
        const outside = path.join(temporaryDirectory, "outside-parent");
        const linkedParent = path.join(temporaryDirectory, "linked-parent");
        await writeSkill(source);
        await fs.mkdir(outside);
        try {
            await fs.symlink(outside, linkedParent, "dir");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EPERM") {
                this.skip();
                return;
            }
            throw error;
        }
        const created = await createAgentSkillArchive(
            source,
            "user",
            TEST_LIMITS
        );
        await expectInvalid(
            extractAgentSkillArchiveAtomically(
                created.bytes,
                "user",
                path.join(linkedParent, "installed"),
                TEST_LIMITS
            ),
            "parent"
        );
        expect(await fs.readdir(outside)).to.deep.equal([]);
    });
});
