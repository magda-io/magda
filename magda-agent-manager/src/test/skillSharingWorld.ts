import jwt from "jsonwebtoken";
import { ZipFile } from "yazl";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants.js";
import { DownstreamServiceError } from "../skills/clients.js";
import { AgentSkillService } from "../skills/service.js";
import {
    AgentSkillAuthorization,
    AgentSkillInstallationAuthorization,
    AgentSkillInstallationRecord,
    AgentSkillInstallationRegistry,
    AgentSkillRecord,
    AgentSkillRecordOccupant,
    AgentSkillRegistry,
    AgentSkillShareGroup,
    AgentSkillShareGroups,
    AgentSkillShareRecipient,
    AgentSkillStorage,
    DownloadedArchive,
    RegistryListOptions,
    RegistryRecordsPage,
    StoredArchiveIdentity
} from "../skills/types.js";
import { AuthenticatedUser } from "../types.js";

/*
 * An in-memory MAGDA for #3861 tests. It emulates the parts of Registry,
 * OPA, Storage and the Access Group API that sharing depends on, closely
 * following the typed policies in magda-opa:
 *
 * - Registry reads are filtered by the caller's typed read decision;
 * - publication read = owner, exempt system skill for holders of the stock
 *   read, or an attached group permission held through membership;
 * - Storage reads of a reserved archive need the linked record's typed read;
 * - installation records are owner-only, with no update.
 *
 * The OPA policies themselves are covered by the Rego tests; this world lets
 * service tests exercise real lifecycles end to end.
 */

export const JWT_SECRET = "sharing-world-secret";

export function person(name: string, digit: string): AuthenticatedUser {
    return {
        id: `00000000-0000-4000-8000-${digit.repeat(12)}`,
        sessionToken: `${name}-session`
    };
}

export const alice = person("alice", "a");
export const bob = person("bob", "b");
export const carol = person("carol", "c");
// Holds source reads but no installation permission.
export const dave = person("dave", "d");
// Trusted non-admin system skill manager ("Agent Skills Admins").
export const sysmgr = person("sysmgr", "e");

const KNOWN = [alice, bob, carol, dave, sysmgr];

export async function skillZip(
    name: string,
    description = `${name} description`,
    body = "Instructions."
): Promise<Buffer> {
    const zip = new ZipFile();
    zip.addBuffer(
        Buffer.from(
            `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${body}\n`
        ),
        "SKILL.md"
    );
    zip.end();
    const chunks: Buffer[] = [];
    for await (const chunk of zip.outputStream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

interface Group extends AgentSkillShareGroup {
    members: Set<string>;
}

export class SharingWorld {
    records = new Map<string, any>();
    archives = new Map<
        string,
        { bytes: Buffer; recordId: string; ownerId: string }
    >();
    groups = new Map<string, Group>();
    orgUnits = new Set<string>(["00000000-0000-4000-8000-0000000000f1"]);
    /** Users holding "Manage Own Installed Agent Skills". */
    installers = new Set<string>([alice.id, bob.id, carol.id]);
    /** Users holding the stock exemption-capable system read. */
    systemReaders = new Set<string>([alice.id, bob.id, carol.id, dave.id]);
    calls: Array<{
        service: string;
        operation: string;
        id: string;
        token: string;
    }> = [];
    failures = new Map<string, Error>();
    private groupCounter = 0;

    private fail(key: string): void {
        const error = this.failures.get(key);
        if (error) {
            this.failures.delete(key);
            throw error;
        }
    }

    /** undefined = internal administrator session. */
    actor(token: string): string | undefined | null {
        const known = KNOWN.find((user) => user.sessionToken === token);
        if (known) return known.id;
        try {
            const payload = jwt.verify(token, JWT_SECRET, {
                algorithms: ["HS256"]
            }) as { userId?: string };
            if (payload.userId === DEFAULT_ADMIN_USER_ID) return undefined;
        } catch {
            // fall through
        }
        return null;
    }

    private groupPermissionsOf(userId: string): Group[] {
        return [...this.groups.values()].filter((group) =>
            group.members.has(userId)
        );
    }

    /** Typed OPA emulation for one concrete record. */
    allowed(operation: string, record: any, token: string): boolean {
        const actor = this.actor(token);
        if (actor === undefined) return true;
        if (actor === null) return false;
        const skill = record?.aspects?.["agent-skill"];
        const installation = record?.aspects?.["agent-skill-installation"];
        const accessControl = record?.aspects?.["access-control"] || {};
        if (skill && installation) return false;
        if (installation) {
            if (!this.installers.has(actor)) return false;
            if (operation === "update") return false;
            return (
                installation.userId === actor &&
                accessControl.ownerId === actor &&
                String(record.id).startsWith(`agent-skill-${actor}-`)
            );
        }
        if (!skill) return false;
        const type = skill.type;
        if (operation !== "read") {
            if (type === "system") return actor === sysmgr.id;
            return (
                accessControl.ownerId === actor &&
                (operation !== "create" || skill.userId === actor)
            );
        }
        if (type === "system" && actor === sysmgr.id) return true;
        if (type === "user" && accessControl.ownerId === actor) return true;
        if (
            type === "system" &&
            accessControl.constraintExemption === true &&
            this.systemReaders.has(actor)
        )
            return true;
        const attached: string[] =
            accessControl.preAuthorisedPermissionIds || [];
        return this.groupPermissionsOf(actor).some(
            (group) =>
                group.resourceUri === `object/agentSkill/${type}` &&
                group.operationUris.includes(
                    `object/agentSkill/${type}/read`
                ) &&
                attached.includes(group.permissionId)
        );
    }

    publication(id: string): AgentSkillRecord | undefined {
        const record = this.records.get(id);
        return record?.aspects?.["agent-skill"] ? record : undefined;
    }

    /* ------------------------------ Registry ------------------------------ */

    registry(): AgentSkillRegistry & AgentSkillInstallationRegistry {
        const world = this;
        const clone = <T>(value: T): T => structuredClone(value);
        return {
            async get(id: string, token: string) {
                world.calls.push({
                    service: "registry",
                    operation: "get",
                    id,
                    token
                });
                world.fail(`registry.get:${id}`);
                const record = world.records.get(id);
                if (!record?.aspects?.["agent-skill"]) return undefined;
                if (!world.allowed("read", record, token)) return undefined;
                return clone({
                    ...record,
                    aspects: {
                        "agent-skill": record.aspects["agent-skill"],
                        "access-control": record.aspects["access-control"]
                    }
                });
            },
            async list(
                options: RegistryListOptions,
                token: string
            ): Promise<RegistryRecordsPage> {
                world.fail("registry.list");
                const records = [...world.records.values()].filter((record) => {
                    const aspect = record.aspects["agent-skill"];
                    if (!aspect) return false;
                    const userMatches =
                        !options.userId ||
                        (options.userId.operator === "eq"
                            ? aspect.userId === options.userId.value
                            : aspect.userId !== options.userId.value);
                    const anyMatches =
                        !options.anyOf?.length ||
                        options.anyOf.some((condition) => {
                            const actual =
                                condition.field === "type"
                                    ? aspect.type
                                    : aspect.userId;
                            return condition.operator === "eq"
                                ? actual === condition.value
                                : actual !== condition.value;
                        });
                    return (
                        (!options.type || aspect.type === options.type) &&
                        (!options.state || aspect.state === options.state) &&
                        userMatches &&
                        anyMatches &&
                        (!options.q || aspect.name.includes(options.q)) &&
                        world.allowed("read", record, token)
                    );
                });
                return { hasMore: false, records: records.map(clone) };
            },
            async create(record: AgentSkillRecord, token: string) {
                world.calls.push({
                    service: "registry",
                    operation: "create",
                    id: record.id,
                    token
                });
                world.fail(`registry.create:${record.id}`);
                if (world.records.has(record.id))
                    throw new DownstreamServiceError("registry", 400, "exists");
                if (!world.allowed("create", record, token))
                    throw new DownstreamServiceError("registry", 403, "denied");
                world.records.set(record.id, clone(record));
                return record;
            },
            async put(record: AgentSkillRecord, token: string) {
                world.calls.push({
                    service: "registry",
                    operation: "put",
                    id: record.id,
                    token
                });
                world.fail(`registry.put:${record.id}`);
                const current = world.records.get(record.id);
                if (
                    current &&
                    (!world.allowed("update", current, token) ||
                        !world.allowed("update", record, token))
                )
                    throw new DownstreamServiceError("registry", 403, "denied");
                world.records.set(record.id, {
                    ...(current || {}),
                    ...clone(record),
                    aspects: {
                        ...(current?.aspects || {}),
                        ...clone(record.aspects)
                    }
                });
                return record;
            },
            async delete(id: string, token: string) {
                world.calls.push({
                    service: "registry",
                    operation: "delete",
                    id,
                    token
                });
                const current = world.records.get(id);
                if (!current) return;
                if (!world.allowed("delete", current, token))
                    throw new DownstreamServiceError("registry", 403, "denied");
                world.records.delete(id);
            },
            async getInstallation(id: string, token: string) {
                world.fail(`registry.getInstallation:${id}`);
                const record = world.records.get(id);
                if (!record?.aspects?.["agent-skill-installation"])
                    return undefined;
                if (!world.allowed("read", record, token)) return undefined;
                return clone(record);
            },
            async listInstallations(
                options: { userId: string; pageToken?: string; limit: number },
                token: string
            ): Promise<RegistryRecordsPage> {
                world.fail("registry.listInstallations");
                const records = [...world.records.values()].filter(
                    (record) =>
                        record.aspects["agent-skill-installation"]?.userId ===
                            options.userId &&
                        world.allowed("read", record, token)
                );
                return { hasMore: false, records: records.map(clone) };
            },
            async createInstallation(
                record: AgentSkillInstallationRecord,
                token: string
            ) {
                world.calls.push({
                    service: "registry",
                    operation: "createInstallation",
                    id: record.id,
                    token
                });
                world.fail(`registry.createInstallation:${record.id}`);
                if (world.records.has(record.id))
                    throw new DownstreamServiceError("registry", 400, "exists");
                if (!world.allowed("create", record, token))
                    throw new DownstreamServiceError("registry", 403, "denied");
                world.records.set(record.id, clone(record));
                return record;
            },
            async deleteInstallation(id: string, token: string) {
                world.calls.push({
                    service: "registry",
                    operation: "deleteInstallation",
                    id,
                    token
                });
                world.fail(`registry.deleteInstallation:${id}`);
                const current = world.records.get(id);
                if (!current) return;
                if (!world.allowed("delete", current, token))
                    throw new DownstreamServiceError("registry", 403, "denied");
                world.records.delete(id);
            },
            async occupant(id: string): Promise<AgentSkillRecordOccupant> {
                const record = world.records.get(id);
                if (!record) return "none";
                if (record.aspects["agent-skill"]) return "publication";
                if (record.aspects["agent-skill-installation"])
                    return "installation";
                return "other";
            }
        };
    }

    /* ------------------------------- Storage ------------------------------ */

    storage(): AgentSkillStorage {
        const world = this;
        return {
            async inspect(key: string): Promise<StoredArchiveIdentity> {
                const archive = world.archives.get(key);
                return archive
                    ? {
                          exists: true,
                          recordId: archive.recordId,
                          ownerId: archive.ownerId
                      }
                    : { exists: false };
            },
            async download(
                key: string,
                token: string
            ): Promise<DownloadedArchive> {
                world.calls.push({
                    service: "storage",
                    operation: "download",
                    id: key,
                    token
                });
                world.fail(`storage.download:${key}`);
                const archive = world.archives.get(key);
                if (!archive)
                    throw new DownstreamServiceError("storage", 404, "missing");
                // Reserved-prefix read: typed read of the linked publication.
                const record = world.records.get(archive.recordId);
                if (
                    !record?.aspects?.["agent-skill"] ||
                    !world.allowed("read", record, token)
                )
                    throw new DownstreamServiceError("storage", 403, "denied");
                return {
                    bytes: Buffer.from(archive.bytes),
                    contentType: "application/zip",
                    recordId: archive.recordId,
                    ownerId: archive.ownerId
                };
            },
            async upload(
                key: string,
                recordId: string,
                bytes: Buffer,
                token: string
            ) {
                world.calls.push({
                    service: "storage",
                    operation: "upload",
                    id: key,
                    token
                });
                world.fail(`storage.upload:${key}`);
                const existing = world.archives.get(key);
                const actor = world.actor(token);
                world.archives.set(key, {
                    bytes: Buffer.from(bytes),
                    recordId,
                    ownerId: existing?.ownerId || actor || DEFAULT_ADMIN_USER_ID
                });
            },
            async delete(key: string, token: string) {
                world.calls.push({
                    service: "storage",
                    operation: "delete",
                    id: key,
                    token
                });
                world.archives.delete(key);
            }
        };
    }

    /* ---------------------------- Authorization --------------------------- */

    authorization(): AgentSkillAuthorization &
        AgentSkillInstallationAuthorization {
        const world = this;
        return {
            async can(operation, record, token) {
                world.fail("opa");
                return world.allowed(operation, record, token);
            },
            async canInstallation(operation, record, token) {
                world.fail("opa");
                return world.allowed(operation, record, token);
            }
        };
    }

    /* ---------------------------- Access Groups --------------------------- */

    shareGroups(): AgentSkillShareGroups {
        const world = this;
        const requireInternal = (token: string) => {
            if (world.actor(token) !== undefined)
                throw new DownstreamServiceError(
                    "authorization",
                    403,
                    "denied"
                );
        };
        const project = (group: Group): AgentSkillShareGroup => ({
            id: group.id,
            resourceUri: group.resourceUri,
            operationUris: [...group.operationUris],
            permissionId: group.permissionId,
            roleId: group.roleId,
            keywords: [...group.keywords]
        });
        return {
            async find(keyword, token) {
                requireInternal(token);
                world.fail("groups.find");
                return [...world.groups.values()]
                    .filter((group) => group.keywords.includes(keyword))
                    .map(project);
            },
            async create(group, token) {
                requireInternal(token);
                world.fail("groups.create");
                world.groupCounter += 1;
                const n = String(world.groupCounter).padStart(12, "0");
                const created: Group = {
                    id: `00000000-0000-4000-9000-${n}`,
                    resourceUri: group.resourceUri,
                    operationUris: [...group.operationUris],
                    permissionId: `00000000-0000-4000-a000-${n}`,
                    roleId: `00000000-0000-4000-b000-${n}`,
                    keywords: [...group.keywords],
                    members: new Set()
                };
                world.groups.set(created.id, created);
                return project(created);
            },
            async delete(groupId, token) {
                requireInternal(token);
                world.groups.delete(groupId);
            },
            async addUser(groupId, userId, token) {
                requireInternal(token);
                world.fail("groups.addUser");
                if (!KNOWN.some((user) => user.id === userId))
                    throw new DownstreamServiceError(
                        "authorization",
                        404,
                        "no user"
                    );
                const group = world.groups.get(groupId)!;
                if (group.members.has(userId)) return false;
                group.members.add(userId);
                return true;
            },
            async removeUser(groupId, userId, token) {
                requireInternal(token);
                return world.groups.get(groupId)!.members.delete(userId);
            },
            async listUsers(
                groupId,
                options,
                token
            ): Promise<AgentSkillShareRecipient[]> {
                requireInternal(token);
                return [...world.groups.get(groupId)!.members]
                    .sort()
                    .slice(options.offset, options.offset + options.limit)
                    .map((id) => ({ id, displayName: `User ${id.slice(-1)}` }));
            },
            async publicationsUsingPermission(permissionId, token) {
                requireInternal(token);
                return [...world.records.values()]
                    .filter(
                        (record) =>
                            record.aspects["agent-skill"] &&
                            (
                                record.aspects["access-control"]
                                    ?.preAuthorisedPermissionIds || []
                            ).includes(permissionId)
                    )
                    .map((record) => record.id);
            },
            async orgUnitExists(orgUnitId, token) {
                requireInternal(token);
                return world.orgUnits.has(orgUnitId);
            }
        };
    }

    service(
        now = () => new Date("2026-10-21T00:00:00.000Z")
    ): AgentSkillService {
        const registry = this.registry();
        const authorization = this.authorization();
        let tick = 0;
        return new AgentSkillService({
            registry,
            storage: this.storage(),
            authorization,
            installationRegistry: registry,
            installationAuthorization: authorization,
            shareGroups: this.shareGroups(),
            tenantId: 0,
            jwtSecret: JWT_SECRET,
            now: () => new Date(now().getTime() + tick++ * 1000),
            archiveLimits: {
                maxCompressedBytes: 1024 * 1024,
                maxUncompressedBytes: 2 * 1024 * 1024,
                maxEntries: 16,
                maxPathLength: 120,
                maxNestingDepth: 5,
                maxSkillMarkdownBytes: 64 * 1024
            }
        });
    }
}

/** Test doubles for suites that do not exercise #3861. */
export function noInstallations(): AgentSkillInstallationRegistry &
    AgentSkillInstallationAuthorization {
    return {
        async getInstallation() {
            return undefined;
        },
        async listInstallations() {
            return { hasMore: false, records: [] };
        },
        async createInstallation() {
            throw new Error("not used");
        },
        async deleteInstallation() {
            throw new Error("not used");
        },
        async occupant() {
            return "none" as const;
        },
        async canInstallation() {
            return false;
        }
    };
}

export function noShareGroups(): AgentSkillShareGroups {
    const unused = async (): Promise<never> => {
        throw new Error("not used");
    };
    return {
        find: async () => [],
        create: unused,
        delete: unused,
        addUser: unused,
        removeUser: unused,
        listUsers: async () => [],
        publicationsUsingPermission: async () => [],
        orgUnitExists: unused
    };
}
