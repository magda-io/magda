import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { TextDecoder } from "node:util";
import CRC32 from "crc-32";
import { JSON_SCHEMA, load as loadYaml } from "js-yaml";
import yauzl, { Entry, ZipFile as YauzlZipFile } from "yauzl";
import { ZipFile as YazlZipFile } from "yazl";
import type { AgentSkillType } from "./agentSkillTypes.js";

export type { AgentSkillType } from "./agentSkillTypes.js";

export interface AgentSkillArchiveLimits {
    maxCompressedBytes: number;
    maxUncompressedBytes: number;
    maxEntries: number;
    maxPathLength: number;
    maxNestingDepth: number;
    maxSkillMarkdownBytes: number;
}

export const DEFAULT_AGENT_SKILL_ARCHIVE_LIMITS: Readonly<AgentSkillArchiveLimits> = Object.freeze(
    {
        maxCompressedBytes: 8 * 1024 * 1024,
        maxUncompressedBytes: 32 * 1024 * 1024,
        maxEntries: 256,
        maxPathLength: 240,
        maxNestingDepth: 8,
        maxSkillMarkdownBytes: 1024 * 1024
    }
);

export interface AgentSkillMarkdown {
    name: string;
    description: string;
    body: string;
}

export interface ValidatedAgentSkillTree extends AgentSkillMarkdown {
    type: AgentSkillType;
    entries: string[];
    uncompressedBytes: number;
    treeDigest: string;
}

export interface CreatedAgentSkillArchive extends ValidatedAgentSkillTree {
    bytes: Buffer;
    compressedBytes: number;
    /** SHA-256 of the exact ZIP bytes. */
    archiveSha256: string;
    /** Compatibility name for the published archive checksum. */
    checksum: string;
}

export interface ValidatedAgentSkillArchive extends ValidatedAgentSkillTree {
    compressedBytes: number;
    /** SHA-256 of the exact ZIP bytes. */
    archiveSha256: string;
    /** Compatibility name for the published archive checksum. */
    checksum: string;
}

export interface ExtractedAgentSkillArchive extends ValidatedAgentSkillArchive {
    destination: string;
    /** Alias used by callers that stage extraction before choosing a final name. */
    directory: string;
}

interface TreeFile {
    path: string;
    content: Buffer;
    /** Sanitized POSIX permissions: readable data plus safe executable bits. */
    mode: number;
}

interface InspectedArchive {
    result: ValidatedAgentSkillArchive;
    files: TreeFile[];
}

const USER_FILE_PATTERN = /\.md$/i;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_NAME_LENGTH = 46;
const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
const RESERVED_RUNTIME_SKILL_NAMES = new Set(["capture-workflow", "magda-mgd"]);
const TREE_DIGEST_DOMAIN = Buffer.from("magda-agent-skill-tree-v1\0", "utf8");
// ZIP's DOS timestamp has a two-second resolution and begins in 1980. Constructing
// this in local time plus forceDosTimestamp makes the encoded bytes timezone-free.
const DETERMINISTIC_ZIP_TIME = new Date(1980, 0, 1, 0, 0, 0, 0);

export class AgentSkillArchiveError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "AgentSkillArchiveError";
    }
}

/** Backward-friendly alias for callers that describe this as validation only. */
export { AgentSkillArchiveError as ArchiveValidationError };

function invalid(message: string, cause?: unknown): never {
    throw new AgentSkillArchiveError(
        message,
        cause === undefined ? undefined : { cause }
    );
}

function resolvedLimits(
    overrides: Partial<AgentSkillArchiveLimits> = {}
): AgentSkillArchiveLimits {
    const limits = { ...DEFAULT_AGENT_SKILL_ARCHIVE_LIMITS, ...overrides };
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            invalid(`${name} must be a positive safe integer`);
        }
    }
    return limits;
}

function validateType(type: AgentSkillType): void {
    if (type !== "system" && type !== "user") {
        invalid("Agent Skill type must be system or user");
    }
}

export function sha256Hex(value: Buffer | Uint8Array | string): string {
    return createHash("sha256").update(value).digest("hex");
}

function canonicalPath(value: string): string {
    return value.normalize("NFC").toLowerCase();
}

function comparePaths(left: string, right: string): number {
    return Buffer.compare(
        Buffer.from(left, "utf8"),
        Buffer.from(right, "utf8")
    );
}

function validatePortablePath(
    raw: string,
    directory: boolean,
    limits: AgentSkillArchiveLimits
): string {
    if (!raw || raw.includes("\0") || raw.includes("\\")) {
        invalid("Agent Skill contains an invalid entry path");
    }
    if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
        invalid("Agent Skill contains an absolute entry path");
    }
    if (directory !== raw.endsWith("/")) {
        invalid("Agent Skill contains an inconsistent entry path");
    }

    const withoutTrailingSlash = directory ? raw.slice(0, -1) : raw;
    const rawSegments = withoutTrailingSlash.split("/");
    if (
        !withoutTrailingSlash ||
        rawSegments.some(
            (segment) => !segment || segment === "." || segment === ".."
        )
    ) {
        invalid("Agent Skill contains a path traversal entry");
    }
    const normalized = rawSegments
        .map((segment) => segment.normalize("NFC"))
        .join("/");
    if (normalized.length > limits.maxPathLength) {
        invalid("Agent Skill contains an overlong entry path");
    }
    if (rawSegments.length > limits.maxNestingDepth) {
        invalid("Agent Skill exceeds the nesting depth limit");
    }
    return normalized;
}

function validateMetadata(
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
    if (!description || description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
        invalid("SKILL.md description must be 1-1024 characters");
    }
    return { name, description };
}

export function validateAgentSkillNameForType(
    name: string,
    type: AgentSkillType
): void {
    validateType(type);
    validateMetadata(name, "valid");
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

export const validateAgentSkillName = validateAgentSkillNameForType;

export function parseAgentSkillMarkdown(
    markdown: Buffer | Uint8Array | string
): AgentSkillMarkdown {
    let text: string;
    if (typeof markdown === "string") {
        text = markdown;
    } else {
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(markdown);
        } catch (error) {
            invalid("SKILL.md must be valid UTF-8", error);
        }
    }

    const match = text.match(
        /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/
    );
    if (!match) invalid("SKILL.md must begin with YAML frontmatter");

    let frontmatter: unknown;
    try {
        frontmatter = loadYaml(match[1], { schema: JSON_SCHEMA });
    } catch (error) {
        invalid("SKILL.md contains invalid YAML frontmatter", error);
    }
    if (
        !frontmatter ||
        typeof frontmatter !== "object" ||
        Array.isArray(frontmatter)
    ) {
        invalid("SKILL.md frontmatter must be an object");
    }
    const values = frontmatter as Record<string, unknown>;
    const metadata = validateMetadata(values.name, values.description);
    const body = match[2];
    if (!body.trim()) invalid("SKILL.md must contain a Markdown body");
    return { ...metadata, body };
}

function safeRegularFileMode(type: AgentSkillType, sourceMode: number): number {
    return type === "system" ? 0o644 | (sourceMode & 0o111) : 0o644;
}

function digestFiles(files: readonly TreeFile[]): string {
    const hash = createHash("sha256");
    hash.update(TREE_DIGEST_DOMAIN);
    for (const file of [...files].sort((a, b) =>
        comparePaths(a.path, b.path)
    )) {
        const pathBytes = Buffer.from(file.path, "utf8");
        const header = Buffer.allocUnsafe(14);
        header.writeUInt32BE(pathBytes.length, 0);
        header.writeBigUInt64BE(BigInt(file.content.length), 4);
        header.writeUInt16BE(file.mode, 12);
        hash.update(header);
        hash.update(pathBytes);
        hash.update(file.content);
    }
    return hash.digest("hex");
}

function assertNewTreePath(
    normalized: string,
    directory: boolean,
    explicitPaths: Map<string, "file" | "directory">
): void {
    const canonical = canonicalPath(normalized);
    if (explicitPaths.has(canonical)) {
        invalid("Agent Skill contains duplicate entry paths");
    }
    const segments = canonical.split("/");
    for (let index = 1; index < segments.length; index += 1) {
        if (explicitPaths.get(segments.slice(0, index).join("/")) === "file") {
            invalid(
                "Agent Skill contains conflicting file and directory paths"
            );
        }
    }
    if (
        !directory &&
        [...explicitPaths.keys()].some((item) =>
            item.startsWith(`${canonical}/`)
        )
    ) {
        invalid("Agent Skill contains conflicting file and directory paths");
    }
    explicitPaths.set(canonical, directory ? "directory" : "file");
}

async function readRegularFileWithoutFollowing(
    filePath: string,
    expectedDevice: bigint,
    expectedInode: bigint,
    remainingBytes: number
): Promise<Buffer> {
    let handle: fs.FileHandle | undefined;
    try {
        handle = await fs.open(
            filePath,
            fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
        );
        const stat = await handle.stat({ bigint: true });
        if (
            !stat.isFile() ||
            stat.dev !== expectedDevice ||
            stat.ino !== expectedInode
        ) {
            invalid("Local Agent Skill changed during validation");
        }
        if (stat.size > BigInt(remainingBytes)) {
            invalid("Agent Skill exceeds the uncompressed size limit");
        }
        const content = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (
            !after.isFile() ||
            after.dev !== stat.dev ||
            after.ino !== stat.ino ||
            after.size !== BigInt(content.length)
        ) {
            invalid("Local Agent Skill changed during validation");
        }
        return content;
    } catch (error) {
        if (error instanceof AgentSkillArchiveError) throw error;
        invalid(
            "Local Agent Skill contains a symlink or unreadable file",
            error
        );
    } finally {
        await handle?.close().catch(() => undefined);
    }
    // `invalid` always throws; this only helps TypeScript model try/catch/finally.
    throw new AgentSkillArchiveError(
        "Local Agent Skill file could not be read"
    );
}

async function collectLocalFiles(
    rootDirectory: string,
    type: AgentSkillType,
    limits: AgentSkillArchiveLimits
): Promise<TreeFile[]> {
    let rootStat;
    try {
        rootStat = await fs.lstat(rootDirectory);
    } catch (error) {
        invalid("Local Agent Skill directory cannot be read", error);
    }
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        invalid("Local Agent Skill path must be a directory, not a symlink");
    }

    const files: TreeFile[] = [];
    const explicitPaths = new Map<string, "file" | "directory">();
    let entryCount = 0;
    let uncompressedBytes = 0;

    const visit = async (
        absoluteDirectory: string,
        relativeDirectory: string
    ) => {
        let names: string[];
        try {
            names = await fs.readdir(absoluteDirectory);
        } catch (error) {
            invalid("Local Agent Skill directory cannot be read", error);
        }
        names.sort(comparePaths);
        for (const name of names) {
            entryCount += 1;
            if (entryCount > limits.maxEntries) {
                invalid("Agent Skill contains too many entries");
            }
            const rawRelative = relativeDirectory
                ? `${relativeDirectory}/${name}`
                : name;
            const absolute = path.join(absoluteDirectory, name);
            let stat;
            try {
                stat = await fs.lstat(absolute, { bigint: true });
            } catch (error) {
                invalid("Local Agent Skill entry cannot be inspected", error);
            }
            if (stat.isSymbolicLink()) {
                invalid("Local Agent Skill must not contain symbolic links");
            }
            if (stat.isDirectory()) {
                const normalized = validatePortablePath(
                    `${rawRelative}/`,
                    true,
                    limits
                );
                assertNewTreePath(normalized, true, explicitPaths);
                await visit(absolute, normalized);
                continue;
            }
            if (!stat.isFile()) {
                invalid("Local Agent Skill must contain regular files only");
            }
            if ((stat.mode & 0o7000n) !== 0n) {
                invalid(
                    "Local Agent Skill files must not use special permission bits"
                );
            }

            const normalized = validatePortablePath(rawRelative, false, limits);
            assertNewTreePath(normalized, false, explicitPaths);
            if (type === "user" && !USER_FILE_PATTERN.test(normalized)) {
                invalid("User Agent Skills may contain Markdown files only");
            }
            const content = await readRegularFileWithoutFollowing(
                absolute,
                stat.dev,
                stat.ino,
                limits.maxUncompressedBytes - uncompressedBytes
            );
            uncompressedBytes += content.length;
            if (uncompressedBytes > limits.maxUncompressedBytes) {
                invalid("Agent Skill exceeds the uncompressed size limit");
            }
            if (
                normalized === "SKILL.md" &&
                content.length > limits.maxSkillMarkdownBytes
            ) {
                invalid("SKILL.md exceeds the size limit");
            }
            files.push({
                path: normalized,
                content,
                mode: safeRegularFileMode(type, Number(stat.mode))
            });
        }
    };

    await visit(rootDirectory, "");
    files.sort((a, b) => comparePaths(a.path, b.path));
    return files;
}

function validateTree(
    files: readonly TreeFile[],
    type: AgentSkillType
): ValidatedAgentSkillTree {
    const skill = files.find((file) => file.path === "SKILL.md");
    if (!skill) invalid("Agent Skill must contain SKILL.md at its root");
    const markdown = parseAgentSkillMarkdown(skill.content);
    validateAgentSkillNameForType(markdown.name, type);
    return {
        ...markdown,
        type,
        entries: files.map((file) => file.path),
        uncompressedBytes: files.reduce(
            (total, file) => total + file.content.length,
            0
        ),
        treeDigest: digestFiles(files)
    };
}

export async function validateAgentSkillDirectory(
    directory: string,
    type: AgentSkillType,
    limitOverrides: Partial<AgentSkillArchiveLimits> = {}
): Promise<ValidatedAgentSkillTree> {
    validateType(type);
    const limits = resolvedLimits(limitOverrides);
    const files = await collectLocalFiles(
        path.resolve(directory),
        type,
        limits
    );
    return validateTree(files, type);
}

/** SHA-256 tree digest over NFC paths, safe modes, and exact file bytes. */
export async function calculateAgentSkillTreeDigest(
    directory: string,
    limitOverrides: Partial<AgentSkillArchiveLimits> = {}
): Promise<string> {
    const limits = resolvedLimits(limitOverrides);
    // System rules allow every regular supporting-file extension and do not alter
    // digest semantics. Metadata naming is intentionally not parsed here.
    const files = await collectLocalFiles(
        path.resolve(directory),
        "system",
        limits
    );
    return digestFiles(files);
}

export const computeAgentSkillTreeDigest = calculateAgentSkillTreeDigest;

function zipFiles(files: readonly TreeFile[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const archive = new YazlZipFile();
        const chunks: Buffer[] = [];
        archive.outputStream.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        archive.outputStream.once("error", reject);
        archive.outputStream.once("end", () => resolve(Buffer.concat(chunks)));
        try {
            for (const file of files) {
                archive.addBuffer(file.content, file.path, {
                    mtime: DETERMINISTIC_ZIP_TIME,
                    mode: 0o100000 | file.mode,
                    compress: true,
                    // Supported by yazl 3.x but missing from @types/yazl.
                    forceDosTimestamp: true
                } as Parameters<YazlZipFile["addBuffer"]>[2]);
            }
            archive.end();
        } catch (error) {
            reject(error);
        }
    });
}

export async function createAgentSkillArchive(
    directory: string,
    type: AgentSkillType,
    limitOverrides: Partial<AgentSkillArchiveLimits> = {}
): Promise<CreatedAgentSkillArchive> {
    validateType(type);
    const limits = resolvedLimits(limitOverrides);
    const files = await collectLocalFiles(
        path.resolve(directory),
        type,
        limits
    );
    const tree = validateTree(files, type);
    const bytes = await zipFiles(files);
    if (bytes.length > limits.maxCompressedBytes) {
        invalid("Agent Skill ZIP exceeds the compressed size limit");
    }
    const archiveSha256 = sha256Hex(bytes);
    return {
        ...tree,
        bytes,
        compressedBytes: bytes.length,
        archiveSha256,
        checksum: archiveSha256
    };
}

export const createDeterministicAgentSkillArchive = createAgentSkillArchive;

/** Inspect a local tree and include its deterministic archive checksum. */
export async function inspectAgentSkillDirectory(
    directory: string,
    type: AgentSkillType,
    limitOverrides: Partial<AgentSkillArchiveLimits> = {}
): Promise<CreatedAgentSkillArchive> {
    return createAgentSkillArchive(directory, type, limitOverrides);
}

function validateZipEntryType(entry: Entry, directory: boolean): number {
    if ((entry.generalPurposeBitFlag & (0x1 | 0x40)) !== 0) {
        invalid("Encrypted ZIP entries are not supported");
    }
    if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
        invalid("ZIP entry uses an unsupported compression method");
    }
    const creatorSystem = entry.versionMadeBy >>> 8;
    if (creatorSystem !== 3) return 0;
    const mode = entry.externalFileAttributes >>> 16;
    const fileType = mode & 0o170000;
    if ((mode & 0o7000) !== 0) {
        invalid("ZIP entries must not use special permission bits");
    }
    if (fileType === 0) return mode;
    const expectedType = directory ? 0o040000 : 0o100000;
    if (fileType !== expectedType) {
        invalid("ZIP links and special files are not allowed");
    }
    return mode;
}

function openZip(bytes: Buffer): Promise<YauzlZipFile> {
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
                        new AgentSkillArchiveError(
                            "The content is not a valid ZIP archive",
                            error ? { cause: error } : undefined
                        )
                    );
                    return;
                }
                resolve(zip);
            }
        );
    });
}

async function inspectAgentSkillArchive(
    input: Buffer | Uint8Array,
    type: AgentSkillType,
    limitOverrides: Partial<AgentSkillArchiveLimits>
): Promise<InspectedArchive> {
    validateType(type);
    const limits = resolvedLimits(limitOverrides);
    const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
    if (!bytes.length) invalid("A non-empty ZIP archive is required");
    if (bytes.length > limits.maxCompressedBytes) {
        invalid("Agent Skill ZIP exceeds the compressed size limit");
    }

    const zip = await openZip(bytes);
    if (zip.entryCount > limits.maxEntries) {
        zip.close();
        invalid("Agent Skill ZIP contains too many entries");
    }

    const files = await new Promise<TreeFile[]>((resolve, reject) => {
        let settled = false;
        let entryCount = 0;
        let declaredTotal = 0;
        let actualTotal = 0;
        const collected: TreeFile[] = [];
        const explicitPaths = new Map<string, "file" | "directory">();

        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            zip.close();
            const message =
                error instanceof Error ? error.message : String(error);
            reject(
                error instanceof AgentSkillArchiveError
                    ? error
                    : new AgentSkillArchiveError(
                          /invalid relative path|absolute path|invalid characters|backslash|nul/i.test(
                              message
                          )
                              ? "ZIP entry path is invalid"
                              : "The ZIP archive is malformed or cannot be read",
                          { cause: error }
                      )
            );
        };

        zip.on("error", fail);
        zip.on("entry", (entry: Entry) => {
            try {
                entryCount += 1;
                if (entryCount > limits.maxEntries) {
                    invalid("Agent Skill ZIP contains too many entries");
                }
                const directory = entry.fileName.endsWith("/");
                const normalized = validatePortablePath(
                    entry.fileName,
                    directory,
                    limits
                );
                assertNewTreePath(normalized, directory, explicitPaths);
                const sourceMode = validateZipEntryType(entry, directory);
                if (
                    !Number.isSafeInteger(entry.compressedSize) ||
                    entry.compressedSize < 0 ||
                    !Number.isSafeInteger(entry.uncompressedSize) ||
                    entry.uncompressedSize < 0
                ) {
                    invalid("ZIP entry contains malformed sizes");
                }
                if (directory) {
                    if (
                        entry.compressedSize !== 0 ||
                        entry.uncompressedSize !== 0 ||
                        entry.crc32 >>> 0 !== 0
                    ) {
                        invalid(
                            "ZIP directory entry contains malformed sizes or CRC"
                        );
                    }
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
                    invalid(
                        "Agent Skill ZIP exceeds the uncompressed size limit"
                    );
                }
                if (
                    normalized === "SKILL.md" &&
                    entry.uncompressedSize > limits.maxSkillMarkdownBytes
                ) {
                    invalid("SKILL.md exceeds the size limit");
                }

                zip.openReadStream(entry, (error, stream) => {
                    if (error || !stream) {
                        fail(
                            error ??
                                new Error("ZIP entry stream is unavailable")
                        );
                        return;
                    }
                    const chunks: Buffer[] = [];
                    let entryBytes = 0;
                    let crc = 0;
                    stream.on("data", (chunk: Buffer) => {
                        if (settled) return;
                        entryBytes += chunk.length;
                        actualTotal += chunk.length;
                        if (
                            entryBytes > entry.uncompressedSize ||
                            actualTotal > limits.maxUncompressedBytes
                        ) {
                            stream.destroy(
                                new AgentSkillArchiveError(
                                    "Agent Skill ZIP exceeds declared or allowed uncompressed size"
                                )
                            );
                            return;
                        }
                        crc = CRC32.buf(chunk, crc);
                        chunks.push(chunk);
                    });
                    stream.on("error", fail);
                    stream.on("end", () => {
                        if (settled) return;
                        if (entryBytes !== entry.uncompressedSize) {
                            fail(
                                new AgentSkillArchiveError(
                                    "ZIP entry uncompressed size does not match its contents"
                                )
                            );
                            return;
                        }
                        if (crc >>> 0 !== entry.crc32 >>> 0) {
                            fail(
                                new AgentSkillArchiveError(
                                    "ZIP entry CRC checksum does not match its contents"
                                )
                            );
                            return;
                        }
                        const content = Buffer.concat(chunks, entryBytes);
                        if (
                            normalized === "SKILL.md" &&
                            content.length > limits.maxSkillMarkdownBytes
                        ) {
                            fail(
                                new AgentSkillArchiveError(
                                    "SKILL.md exceeds the size limit"
                                )
                            );
                            return;
                        }
                        collected.push({
                            path: normalized,
                            content,
                            mode: safeRegularFileMode(type, sourceMode)
                        });
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
                if (
                    entryCount !== zip.entryCount ||
                    actualTotal !== declaredTotal
                ) {
                    invalid(
                        "ZIP archive contains malformed entry counts or sizes"
                    );
                }
                settled = true;
                collected.sort((a, b) => comparePaths(a.path, b.path));
                resolve(collected);
            } catch (error) {
                fail(error);
            }
        });
        zip.readEntry();
    });

    const tree = validateTree(files, type);
    const archiveSha256 = sha256Hex(bytes);
    return {
        files,
        result: {
            ...tree,
            compressedBytes: bytes.length,
            archiveSha256,
            checksum: archiveSha256
        }
    };
}

export async function validateAgentSkillArchive(
    bytes: Buffer | Uint8Array,
    type: AgentSkillType,
    limitOverrides: Partial<AgentSkillArchiveLimits> = {}
): Promise<ValidatedAgentSkillArchive> {
    return (await inspectAgentSkillArchive(bytes, type, limitOverrides)).result;
}

async function pathExists(value: string): Promise<boolean> {
    try {
        await fs.lstat(value);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

/**
 * Validate and extract an archive into a sibling staging directory, then rename
 * it into place. Existing destinations are moved aside and restored if commit
 * fails, so validation/write failures never leave a partially extracted tree.
 */
export async function extractAgentSkillArchiveAtomically(
    bytes: Buffer | Uint8Array,
    type: AgentSkillType,
    destination: string,
    limitOverrides: Partial<AgentSkillArchiveLimits> = {}
): Promise<ExtractedAgentSkillArchive> {
    const inspected = await inspectAgentSkillArchive(
        bytes,
        type,
        limitOverrides
    );
    const resolvedDestination = path.resolve(destination);
    const parent = path.dirname(resolvedDestination);
    const basename = path.basename(resolvedDestination);
    await fs.mkdir(parent, { recursive: true });
    const parentIdentity = await fs.lstat(parent);
    if (parentIdentity.isSymbolicLink() || !parentIdentity.isDirectory()) {
        invalid("Agent Skill destination parent must be a real directory");
    }
    const assertParentUnchanged = async () => {
        const current = await fs.lstat(parent);
        if (
            current.isSymbolicLink() ||
            !current.isDirectory() ||
            current.dev !== parentIdentity.dev ||
            current.ino !== parentIdentity.ino
        ) {
            invalid("Agent Skill destination parent changed during extraction");
        }
    };
    const staging = await fs.mkdtemp(path.join(parent, `.${basename}.tmp-`));
    const backup = path.join(parent, `.${basename}.backup-${randomUUID()}`);
    let movedExisting = false;
    let committed = false;

    try {
        for (const file of inspected.files) {
            const outputPath = path.join(staging, ...file.path.split("/"));
            await fs.mkdir(path.dirname(outputPath), {
                recursive: true,
                mode: 0o755
            });
            await fs.writeFile(outputPath, file.content, {
                flag: "wx",
                mode: file.mode
            });
            // Ensure the requested safe mode even when the process umask is strict.
            await fs.chmod(outputPath, file.mode);
        }
        await fs.chmod(staging, 0o755);
        await assertParentUnchanged();

        if (await pathExists(resolvedDestination)) {
            await assertParentUnchanged();
            await fs.rename(resolvedDestination, backup);
            movedExisting = true;
        }
        try {
            await assertParentUnchanged();
            await fs.rename(staging, resolvedDestination);
            committed = true;
        } catch (error) {
            if (movedExisting) {
                await fs
                    .rename(backup, resolvedDestination)
                    .catch(() => undefined);
                movedExisting = false;
            }
            throw error;
        }
        if (movedExisting) {
            // The destination is already committed. A stale hidden backup is
            // recoverable cleanup and must not make callers persist old state.
            await fs
                .rm(backup, { recursive: true, force: true })
                .catch(() => undefined);
            movedExisting = false;
        }
        return {
            ...inspected.result,
            destination: resolvedDestination,
            directory: resolvedDestination
        };
    } catch (error) {
        if (error instanceof AgentSkillArchiveError) throw error;
        invalid("Agent Skill archive could not be extracted safely", error);
    } finally {
        if (!committed) {
            await fs
                .rm(staging, { recursive: true, force: true })
                .catch(() => undefined);
        }
        if (movedExisting) {
            if (!(await pathExists(resolvedDestination).catch(() => true))) {
                await fs
                    .rename(backup, resolvedDestination)
                    .catch(() => undefined);
            }
        }
    }
    // `invalid` always throws; this only helps TypeScript model try/catch/finally.
    throw new AgentSkillArchiveError("Agent Skill archive extraction failed");
}

export function extractAgentSkillArchive(
    bytes: Buffer | Uint8Array,
    type: AgentSkillType,
    destination: string,
    limitOverrides?: Partial<AgentSkillArchiveLimits>
): Promise<ExtractedAgentSkillArchive>;
export function extractAgentSkillArchive(
    bytes: Buffer | Uint8Array,
    stagingParent: string,
    type: AgentSkillType,
    expectedArchiveSha256?: string
): Promise<ExtractedAgentSkillArchive>;
export async function extractAgentSkillArchive(
    bytes: Buffer | Uint8Array,
    typeOrParent: AgentSkillType | string,
    destinationOrType: string,
    limitsOrChecksum: Partial<AgentSkillArchiveLimits> | string = {}
): Promise<ExtractedAgentSkillArchive> {
    if (typeOrParent === "system" || typeOrParent === "user") {
        return extractAgentSkillArchiveAtomically(
            bytes,
            typeOrParent,
            destinationOrType,
            typeof limitsOrChecksum === "string" ? {} : limitsOrChecksum
        );
    }

    const type = destinationOrType as AgentSkillType;
    validateType(type);
    const inspected = await validateAgentSkillArchive(bytes, type);
    if (
        typeof limitsOrChecksum === "string" &&
        inspected.archiveSha256 !== limitsOrChecksum.toLowerCase()
    ) {
        invalid(
            "Agent Skill archive SHA-256 does not match the expected checksum"
        );
    }
    const stagingDestination = path.join(
        path.resolve(typeOrParent),
        `.agent-skill-extract-${randomUUID()}`
    );
    return extractAgentSkillArchiveAtomically(bytes, type, stagingDestination);
}
