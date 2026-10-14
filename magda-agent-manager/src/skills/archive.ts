import { createHash } from "node:crypto";
import path from "node:path";
import { load as loadYaml, JSON_SCHEMA } from "js-yaml";
import CRC32 from "crc-32";
import yauzl, { Entry, ZipFile } from "yauzl";
import {
    AgentSkillArchiveLimits,
    AgentSkillType,
    ValidatedAgentSkillArchive
} from "./types.js";

const USER_FILE_PATTERN = /\.md$/i;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_NAME_LENGTH = 46;
const RESERVED_RUNTIME_SKILL_NAMES = new Set(["capture-workflow", "magda-mgd"]);

export class ArchiveValidationError extends Error {}

function invalid(message: string): never {
    throw new ArchiveValidationError(message);
}

function normalizedEntryPath(
    entry: Entry
): {
    normalized: string;
    directory: boolean;
} {
    const raw = entry.fileName;
    if (!raw || raw.includes("\0") || raw.includes("\\")) {
        invalid("ZIP contains an invalid entry path");
    }
    if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
        invalid("ZIP contains an absolute entry path");
    }

    const directory = raw.endsWith("/");
    const segments = raw.split("/").filter(Boolean);
    if (!segments.length || segments.some((segment) => segment === "..")) {
        invalid("ZIP contains a path traversal entry");
    }

    const normalized = path.posix
        .normalize(raw)
        .replace(/\/$/, "")
        .normalize("NFC");
    if (
        !normalized ||
        normalized === "." ||
        normalized.startsWith("../") ||
        normalized.includes("/../")
    ) {
        invalid("ZIP contains a path traversal entry");
    }
    return { normalized, directory };
}

function validateEntryType(entry: Entry, directory: boolean): void {
    if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
        invalid("Encrypted ZIP entries are not supported");
    }

    const creatorSystem = entry.versionMadeBy >>> 8;
    if (creatorSystem !== 3) return;
    const mode = entry.externalFileAttributes >>> 16;
    const type = mode & 0o170000;
    if (type === 0) return;
    const expectedType = directory ? 0o040000 : 0o100000;
    if (type !== expectedType) {
        invalid("ZIP links and special files are not allowed");
    }
}

export function validateAgentSkillMetadata(
    nameValue: unknown,
    descriptionValue: unknown
): { name: string; description: string } {
    const name = typeof nameValue === "string" ? nameValue.trim() : "";
    const description =
        typeof descriptionValue === "string" ? descriptionValue.trim() : "";
    if (
        !name ||
        name.length > MAX_SKILL_NAME_LENGTH ||
        !SKILL_NAME_PATTERN.test(name)
    ) {
        invalid(
            "SKILL.md name must be 1-46 lowercase letters, digits, or single hyphen separators"
        );
    }
    if (!description || description.length > 1024) {
        invalid("SKILL.md description must be 1-1024 characters");
    }
    return { name, description };
}

export function validateAgentSkillNameForType(
    name: string,
    type: AgentSkillType
): void {
    if (RESERVED_RUNTIME_SKILL_NAMES.has(name)) {
        invalid(`'${name}' is reserved for a runtime-bundled Agent Skill`);
    }
    if (type === "system" && !name.startsWith("system-")) {
        invalid("System Agent Skill names must start with system-");
    }
    if (type === "user" && name.startsWith("system-")) {
        invalid("User Agent Skill names must not start with system-");
    }
}

function parseSkillMarkdown(
    markdown: Buffer
): {
    name: string;
    description: string;
} {
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(markdown);
    } catch {
        invalid("SKILL.md must be valid UTF-8");
    }
    const match = text.match(
        /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/
    );
    if (!match) invalid("SKILL.md must begin with YAML frontmatter");

    let frontmatter: unknown;
    try {
        frontmatter = loadYaml(match[1], { schema: JSON_SCHEMA });
    } catch {
        invalid("SKILL.md contains invalid YAML frontmatter");
    }
    if (
        !frontmatter ||
        typeof frontmatter !== "object" ||
        Array.isArray(frontmatter)
    ) {
        invalid("SKILL.md frontmatter must be an object");
    }
    const values = frontmatter as Record<string, unknown>;
    const metadata = validateAgentSkillMetadata(
        values.name,
        values.description
    );
    if (!match[2].trim()) {
        invalid("SKILL.md must contain a Markdown body");
    }
    return metadata;
}

function openZip(bytes: Buffer): Promise<ZipFile> {
    return new Promise((resolve, reject) => {
        yauzl.fromBuffer(
            bytes,
            {
                lazyEntries: true,
                decodeStrings: true,
                validateEntrySizes: true,
                strictFileNames: true
            },
            (error, zip) => {
                if (error || !zip) {
                    reject(
                        new ArchiveValidationError(
                            "The uploaded content is not a valid ZIP archive"
                        )
                    );
                } else {
                    resolve(zip);
                }
            }
        );
    });
}

export async function validateAgentSkillArchive(
    bytes: Buffer,
    type: AgentSkillType,
    limits: AgentSkillArchiveLimits
): Promise<ValidatedAgentSkillArchive> {
    if (!Buffer.isBuffer(bytes) || !bytes.length) {
        invalid("A non-empty ZIP archive is required");
    }
    if (bytes.length > limits.maxCompressedBytes) {
        invalid("ZIP archive exceeds the compressed size limit");
    }

    const zip = await openZip(bytes);
    return await new Promise<ValidatedAgentSkillArchive>((resolve, reject) => {
        let settled = false;
        let entryCount = 0;
        let declaredTotal = 0;
        let actualTotal = 0;
        let skillMarkdown: Buffer | undefined;
        const paths = new Map<string, "file" | "directory">();

        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            zip.close();
            reject(
                error instanceof ArchiveValidationError
                    ? error
                    : new ArchiveValidationError(
                          "The ZIP archive is malformed or cannot be read"
                      )
            );
        };

        zip.on("error", fail);
        zip.on("entry", (entry: Entry) => {
            try {
                entryCount += 1;
                if (entryCount > limits.maxEntries) {
                    invalid("ZIP archive contains too many entries");
                }
                const { normalized, directory } = normalizedEntryPath(entry);
                if (normalized.length > limits.maxPathLength) {
                    invalid("ZIP archive contains an overlong entry path");
                }
                if (normalized.split("/").length > limits.maxNestingDepth) {
                    invalid("ZIP archive exceeds the nesting depth limit");
                }
                validateEntryType(entry, directory);

                const canonicalPath = normalized.toLocaleLowerCase("en-US");
                if (paths.has(canonicalPath)) {
                    invalid("ZIP archive contains duplicate entry paths");
                }
                const segments = canonicalPath.split("/");
                for (let index = 1; index < segments.length; index += 1) {
                    if (
                        paths.get(segments.slice(0, index).join("/")) === "file"
                    ) {
                        invalid("ZIP archive contains conflicting entry paths");
                    }
                }
                if (
                    !directory &&
                    [...paths.keys()].some((item) =>
                        item.startsWith(`${canonicalPath}/`)
                    )
                ) {
                    invalid("ZIP archive contains conflicting entry paths");
                }
                paths.set(canonicalPath, directory ? "directory" : "file");

                if (directory) {
                    zip.readEntry();
                    return;
                }
                if (type === "user" && !USER_FILE_PATTERN.test(normalized)) {
                    invalid(
                        "User Agent Skills may contain Markdown files only"
                    );
                }
                declaredTotal += entry.uncompressedSize;
                if (declaredTotal > limits.maxUncompressedBytes) {
                    invalid("ZIP archive exceeds the uncompressed size limit");
                }
                if (
                    normalized === "SKILL.md" &&
                    entry.uncompressedSize > limits.maxSkillMarkdownBytes
                ) {
                    invalid("SKILL.md exceeds the size limit");
                }

                zip.openReadStream(entry, (error, stream) => {
                    if (error || !stream) {
                        fail(error);
                        return;
                    }
                    const chunks: Buffer[] = [];
                    let crc = 0;
                    stream.on("data", (chunk: Buffer) => {
                        crc = CRC32.buf(chunk, crc);
                        actualTotal += chunk.length;
                        if (actualTotal > limits.maxUncompressedBytes) {
                            stream.destroy(
                                new ArchiveValidationError(
                                    "ZIP archive exceeds the uncompressed size limit"
                                )
                            );
                            return;
                        }
                        if (normalized === "SKILL.md") chunks.push(chunk);
                    });
                    stream.on("error", fail);
                    stream.on("end", () => {
                        if (settled) return;
                        if (crc >>> 0 !== entry.crc32 >>> 0) {
                            fail(
                                new ArchiveValidationError(
                                    "ZIP archive contains a CRC checksum mismatch"
                                )
                            );
                            return;
                        }
                        if (normalized === "SKILL.md") {
                            skillMarkdown = Buffer.concat(chunks);
                            if (
                                skillMarkdown.length >
                                limits.maxSkillMarkdownBytes
                            ) {
                                fail(
                                    new ArchiveValidationError(
                                        "SKILL.md exceeds the size limit"
                                    )
                                );
                                return;
                            }
                        }
                        zip.readEntry();
                    });
                });
            } catch (error) {
                fail(error);
            }
        });
        zip.on("end", () => {
            if (settled) return;
            try {
                if (!skillMarkdown) {
                    invalid("ZIP archive must contain SKILL.md at its root");
                }
                const metadata = parseSkillMarkdown(skillMarkdown);
                validateAgentSkillNameForType(metadata.name, type);
                settled = true;
                resolve({
                    ...metadata,
                    checksum: createHash("sha256").update(bytes).digest("hex")
                });
            } catch (error) {
                fail(error);
            }
        });
        zip.readEntry();
    });
}
