import { expect } from "chai";
import { MAX_SHARE_RECIPIENTS } from "../skills/access.js";
import { DownstreamServiceError } from "../skills/clients.js";
import { AgentSkillError, AgentSkillService } from "../skills/service.js";
import { AuthenticatedUser } from "../types.js";
import {
    alice,
    bob,
    carol,
    dave,
    skillZip,
    SharingWorld,
    sysmgr
} from "./skillSharingWorld.js";

const SOURCE = `agent-skill-${alice.id}-csv-reporter`;
const BOB_INSTALL = `agent-skill-${bob.id}-csv-reporter`;
const ORG = "00000000-0000-4000-8000-0000000000f1";

async function caught(promise: Promise<unknown>): Promise<AgentSkillError> {
    try {
        await promise;
    } catch (error) {
        return error as AgentSkillError;
    }
    throw new Error("expected the operation to fail");
}

function sharedList(service: AgentSkillService, user: AuthenticatedUser) {
    return service.list({ type: "user", userId: "!current", limit: 20 }, user);
}

describe("Agent Skill sharing and installations (#3861)", () => {
    let world: SharingWorld;
    let service: AgentSkillService;
    let originalInfo: typeof console.info;
    let originalWarn: typeof console.warn;

    beforeEach(async () => {
        originalInfo = console.info;
        originalWarn = console.warn;
        console.info = () => undefined;
        console.warn = () => undefined;
        world = new SharingWorld();
        service = world.service();
        await service.createAuthorized(
            "user",
            await skillZip("csv-reporter"),
            alice
        );
    });

    afterEach(() => {
        console.info = originalInfo;
        console.warn = originalWarn;
    });

    async function share(recipient = bob) {
        return service.access.addRecipient("user", SOURCE, recipient.id, alice);
    }

    describe("source access", () => {
        it("keeps a published user skill private before sharing", async () => {
            expect((await sharedList(service, bob)).records).to.deep.equal([]);
            const read = await caught(
                service.prepareExisting("user", SOURCE, "read", bob)
            );
            expect(read.status).to.equal(404);
            const install = await caught(
                service.installations.install({ sourceSkillId: SOURCE }, bob)
            );
            expect(install.code).to.equal("AGENT_SKILL_SOURCE_NOT_FOUND");
            expect(install.status).to.equal(404);
        });

        it("grants exactly typed source read through a source-scoped group", async () => {
            expect(await share()).to.deep.equal({ added: true });
            const [group] = [...world.groups.values()];
            expect(group.resourceUri).to.equal("object/agentSkill/user");
            expect(group.operationUris).to.deep.equal([
                "object/agentSkill/user/read"
            ]);
            expect(group.members).to.deep.equal(new Set([bob.id]));
            expect(
                world.publication(SOURCE)!.aspects["access-control"]
                    .preAuthorisedPermissionIds
            ).to.deep.equal([group.permissionId]);
            // The source record is written as the real owner, never as the
            // internal administrator.
            expect(
                world.calls
                    .filter(
                        (call) => call.operation === "put" && call.id === SOURCE
                    )
                    .map((call) => call.token)
            ).to.include(alice.sessionToken);

            const listed = await sharedList(service, bob);
            expect(listed.records.map((item) => item.id)).to.deep.equal([
                SOURCE
            ]);
            const record = await service.prepareExisting(
                "user",
                SOURCE,
                "read",
                bob
            );
            const bytes = await service.downloadAuthorized(record, bob);
            expect(bytes.length).to.be.greaterThan(0);
            // Sharing again is idempotent and creates no second group.
            expect(await share()).to.deep.equal({ added: false });
            expect(world.groups.size).to.equal(1);
        });

        it("does not install a skill merely because it is shared", async () => {
            await share();
            const manifest = await service.getWorkspaceSkillManifest(bob);
            expect(manifest.items).to.deep.equal([]);
            expect(manifest.sources.installations).to.deep.equal({
                complete: true,
                count: 0,
                unavailable: 0
            });
            const local = await service.getLocalSkillSyncManifest(bob);
            expect(local.items).to.deep.equal([]);
        });

        it("hides other users' and current-user publications from the shared catalogue", async () => {
            await service.createAuthorized(
                "user",
                await skillZip("bob-own"),
                bob
            );
            await share();
            expect(
                (await sharedList(service, bob)).records.map((item) => item.id)
            ).to.deep.equal([SOURCE]);
            expect((await sharedList(service, carol)).records).to.deep.equal(
                []
            );
        });

        it("revokes subsequent read and download without touching the ZIP", async () => {
            await share();
            const before = world.archives.get(
                world.publication(SOURCE)!.aspects["agent-skill"].archiveKey
            )!.bytes;
            expect(
                await service.access.removeRecipient(
                    "user",
                    SOURCE,
                    bob.id,
                    alice
                )
            ).to.deep.equal({ removed: true });
            expect((await sharedList(service, bob)).records).to.deep.equal([]);
            expect(
                (
                    await caught(
                        service.prepareExisting("user", SOURCE, "read", bob)
                    )
                ).status
            ).to.equal(404);
            // Even with a stale record in hand, Storage denies the download.
            const record = await service.prepareExisting(
                "user",
                SOURCE,
                "read",
                alice
            );
            const download = await caught(
                service.downloadAuthorized(record, bob)
            );
            expect(download.status).to.equal(403);
            const after = world.archives.get(
                record.aspects["agent-skill"].archiveKey
            )!.bytes;
            expect(after.equals(before)).to.equal(true);
            expect(world.publication(SOURCE)).to.not.equal(undefined);
        });

        it("lets only the source manager edit sharing", async () => {
            await share();
            for (const user of [bob, carol, dave]) {
                const error = await caught(
                    service.access.addRecipient("user", SOURCE, carol.id, user)
                );
                expect(error.status, user.sessionToken).to.equal(404);
                expect(
                    (
                        await caught(
                            service.access.removeRecipient(
                                "user",
                                SOURCE,
                                bob.id,
                                user
                            )
                        )
                    ).status
                ).to.equal(404);
                expect(
                    (
                        await caught(
                            service.access.getAccess("user", SOURCE, user)
                        )
                    ).status
                ).to.equal(404);
            }
            expect([...world.groups.values()][0].members).to.deep.equal(
                new Set([bob.id])
            );
        });

        it("lists recipients by ID and display name only, with search and paging", async () => {
            await share(bob);
            await share(carol);
            const all = await service.access.listRecipients(
                "user",
                SOURCE,
                { offset: 0, limit: 10 },
                alice
            );
            expect(all.total).to.equal(2);
            expect(Object.keys(all.items[0]).sort()).to.deep.equal([
                "displayName",
                "id"
            ]);
            const page = await service.access.listRecipients(
                "user",
                SOURCE,
                { offset: 1, limit: 1 },
                alice
            );
            expect(page).to.deep.include({ total: 2 });
            expect(page.items).to.have.length(1);
            const search = await service.access.listRecipients(
                "user",
                SOURCE,
                { offset: 0, limit: 10, keyword: carol.id.slice(-6) },
                alice
            );
            expect(search.items.map((item) => item.id)).to.deep.equal([
                carol.id
            ]);
            expect(
                (await service.access.getAccess("user", SOURCE, alice))
                    .recipients
            ).to.deep.equal({ count: 2 });
        });

        it("rejects invalid, unknown and owner recipients", async () => {
            expect(
                (
                    await caught(
                        service.access.addRecipient(
                            "user",
                            SOURCE,
                            "not-a-uuid",
                            alice
                        )
                    )
                ).code
            ).to.equal("INVALID_RECIPIENT");
            expect((await caught(share(alice))).code).to.equal(
                "INVALID_RECIPIENT"
            );
            expect(
                (
                    await caught(
                        service.access.addRecipient(
                            "user",
                            SOURCE,
                            "00000000-0000-4000-8000-000000000999",
                            alice
                        )
                    )
                ).code
            ).to.equal("RECIPIENT_NOT_FOUND");
        });

        it("enforces the recipient limit and keeps existing recipients idempotent", async () => {
            await share(bob);
            const [group] = [...world.groups.values()];
            for (let i = 0; group.members.size < MAX_SHARE_RECIPIENTS - 1; i++)
                group.members.add(
                    `10000000-0000-4000-8000-${i
                        .toString(16)
                        .padStart(12, "0")}`
                );
            // 499 -> 500 succeeds.
            expect(await share(carol)).to.deep.equal({ added: true });
            expect(group.members.size).to.equal(MAX_SHARE_RECIPIENTS);
            // A new recipient at 500 is refused without changing membership.
            const error = await caught(share(dave));
            expect(error.status).to.equal(409);
            expect(error.code).to.equal("AGENT_SKILL_SHARE_LIMIT_REACHED");
            expect(error.details).to.deep.equal({
                limit: MAX_SHARE_RECIPIENTS
            });
            expect(group.members.has(dave.id)).to.equal(false);
            expect(group.members.size).to.equal(MAX_SHARE_RECIPIENTS);
            // Re-adding an existing recipient at 500 stays idempotent.
            expect(await share(bob)).to.deep.equal({ added: false });
            expect(await share(carol)).to.deep.equal({ added: false });
            expect(
                (await service.access.getAccess("user", SOURCE, alice))
                    .recipients
            ).to.deep.equal({ count: MAX_SHARE_RECIPIENTS });
        });

        it("recovers an interrupted first share by reusing its unattached group", async () => {
            world.failures.set(
                `registry.put:${SOURCE}`,
                new DownstreamServiceError("registry", 503, "unavailable")
            );
            expect((await caught(share())).status).to.equal(503);
            const [group] = [...world.groups.values()];
            expect(group.members.size).to.equal(0);
            expect(
                world.publication(SOURCE)!.aspects["access-control"]
                    .preAuthorisedPermissionIds || []
            ).to.deep.equal([]);
            expect(await share()).to.deep.equal({ added: true });
            expect(world.groups.size).to.equal(1);
            expect(
                world.publication(SOURCE)!.aspects["access-control"]
                    .preAuthorisedPermissionIds
            ).to.deep.equal([group.permissionId]);
        });

        it("refuses a share group whose permission is attached to another skill", async () => {
            await share();
            const [group] = [...world.groups.values()];
            await service.createAuthorized(
                "user",
                await skillZip("carol-skill"),
                carol
            );
            const other = world.records.get(
                `agent-skill-${carol.id}-carol-skill`
            );
            other.aspects["access-control"].preAuthorisedPermissionIds = [
                group.permissionId
            ];
            const error = await caught(share(carol));
            expect(error.code).to.equal("AGENT_SKILL_SHARE_INVALID");
            expect(group.members).to.deep.equal(new Set([bob.id]));
        });

        it("fails closed when the binding query reports more matches than it returned", async () => {
            await share();
            const [group] = [...world.groups.values()];
            world.bindingPageSize = 0;
            expect((await caught(share(carol))).code).to.equal(
                "AGENT_SKILL_SHARE_INVALID"
            );
            expect(group.members).to.deep.equal(new Set([bob.id]));
        });

        it("refuses a tampered share group granting broader operations", async () => {
            await share();
            [...world.groups.values()][0].operationUris = [
                "object/agentSkill/user/read",
                "object/record/read"
            ];
            expect((await caught(share(carol))).code).to.equal(
                "AGENT_SKILL_SHARE_INVALID"
            );
        });

        it("never lets a republished skill inherit the earlier recipients", async () => {
            await share();
            const original = await service.prepareExisting(
                "user",
                SOURCE,
                "delete",
                alice
            );
            await service.deleteAuthorized(
                original,
                alice,
                original.aspects["agent-skill"].checksum
            );
            // Deleting the source also removes its now-unused share group.
            expect(world.groups.size).to.equal(0);
            await service.createAuthorized(
                "user",
                await skillZip("csv-reporter", "republished"),
                alice
            );
            expect((await sharedList(service, bob)).records).to.deep.equal([]);
        });
    });

    describe("installations", () => {
        beforeEach(async () => {
            await share();
        });

        it("installs an authorized source into the recipient namespace only", async () => {
            const result = await service.installations.install(
                { sourceSkillId: SOURCE },
                bob
            );
            expect(result.created).to.equal(true);
            expect(result.installation).to.deep.include({
                id: BOB_INSTALL,
                effectiveName: "csv-reporter",
                userId: bob.id,
                sourceSkillId: SOURCE
            });
            expect(result.installation.source.status).to.equal("available");
            const record = world.records.get(BOB_INSTALL);
            expect(record.aspects["agent-skill"]).to.equal(undefined);
            expect(record.aspects["access-control"]).to.deep.equal({
                ownerId: bob.id
            });
            expect(record.aspects["agent-skill-installation"]).to.deep.equal({
                userId: bob.id,
                sourceSkillId: SOURCE,
                createdAt: record.aspects["agent-skill-installation"].createdAt
            });
            // Created as the real recipient, never the internal administrator.
            expect(
                world.calls.find(
                    (call) => call.operation === "createInstallation"
                )!.token
            ).to.equal(bob.sessionToken);
            // No ZIP is copied for an installation.
            expect(
                [...world.archives.values()].map((archive) => archive.recordId)
            ).to.deep.equal([SOURCE]);
            const again = await service.installations.install(
                { sourceSkillId: SOURCE },
                bob
            );
            expect(again.created).to.equal(false);
        });

        it("normalises an alias equal to the source name and validates aliases", async () => {
            const result = await service.installations.install(
                { sourceSkillId: SOURCE, alias: "csv-reporter" },
                bob
            );
            expect(result.installation.alias).to.equal(undefined);
            for (const alias of [
                "system-csv",
                "magda-mgd",
                "capture-workflow",
                "Bad Name",
                "a".repeat(47),
                ""
            ]) {
                expect(
                    (
                        await caught(
                            service.installations.install(
                                { sourceSkillId: SOURCE, alias },
                                bob
                            )
                        )
                    ).code,
                    alias
                ).to.equal("INVALID_ALIAS");
            }
        });

        it("reports a name collision with the recipient's own publication and suggests an alias", async () => {
            await service.createAuthorized(
                "user",
                await skillZip("csv-reporter"),
                bob
            );
            const error = await caught(
                service.installations.install({ sourceSkillId: SOURCE }, bob)
            );
            expect(error.status).to.equal(409);
            expect(error.code).to.equal("AGENT_SKILL_NAME_CONFLICT");
            expect(error.details).to.deep.equal({
                conflict: "publication",
                suggestedAlias: "csv-reporter-2"
            });
            const aliased = await service.installations.install(
                { sourceSkillId: SOURCE, alias: "csv-reporter-2" },
                bob
            );
            expect(aliased.installation.id).to.equal(
                `agent-skill-${bob.id}-csv-reporter-2`
            );
            expect(
                world.records.get(`agent-skill-${bob.id}-csv-reporter-2`)
            ).to.not.equal(undefined);
        });

        it("reports a collision with another installation of a different source", async () => {
            await service.createAuthorized(
                "user",
                await skillZip("csv-reporter"),
                carol
            );
            await service.access.addRecipient(
                "user",
                `agent-skill-${carol.id}-csv-reporter`,
                bob.id,
                carol
            );
            await service.installations.install({ sourceSkillId: SOURCE }, bob);
            const error = await caught(
                service.installations.install(
                    { sourceSkillId: `agent-skill-${carol.id}-csv-reporter` },
                    bob
                )
            );
            expect(error.code).to.equal("AGENT_SKILL_NAME_CONFLICT");
            expect(error.details?.conflict).to.equal("installation");
        });

        it("prevents publishing over an installed name", async () => {
            await service.installations.install({ sourceSkillId: SOURCE }, bob);
            const error = await caught(
                service.createAuthorized(
                    "user",
                    await skillZip("csv-reporter"),
                    bob
                )
            );
            expect(error.code).to.equal("AGENT_SKILL_ID_CONFLICT");
            expect(
                world.records.get(BOB_INSTALL).aspects["agent-skill"]
            ).to.equal(undefined);
        });

        it("rejects malformed, own and system sources", async () => {
            for (const sourceSkillId of [
                undefined,
                "agent-skill-system-csv",
                "not-a-skill",
                `agent-skill-${alice.id}-Bad`,
                `agent-skill-${alice.id.toUpperCase()}-csv-reporter`
            ]) {
                expect(
                    (
                        await caught(
                            service.installations.install(
                                { sourceSkillId },
                                bob
                            )
                        )
                    ).code
                ).to.equal("INVALID_SOURCE_SKILL_ID");
            }
            expect(
                (
                    await caught(
                        service.installations.install(
                            { sourceSkillId: SOURCE },
                            alice
                        )
                    )
                ).code
            ).to.equal("AGENT_SKILL_OWN_SOURCE");
        });

        it("requires the installer's own install permission", async () => {
            await share(dave);
            const error = await caught(
                service.installations.install({ sourceSkillId: SOURCE }, dave)
            );
            expect(error.status).to.equal(403);
            expect(error.code).to.equal("AGENT_SKILL_INSTALL_FORBIDDEN");
            expect(
                world.records.has(`agent-skill-${dave.id}-csv-reporter`)
            ).to.equal(false);
        });

        it("denies unrelated users without revealing the source", async () => {
            const error = await caught(
                service.installations.install({ sourceSkillId: SOURCE }, carol)
            );
            expect(error.status).to.equal(404);
            expect(error.code).to.equal("AGENT_SKILL_SOURCE_NOT_FOUND");
        });

        it("refuses a pending source and a cross-tenant source", async () => {
            world.publication(SOURCE)!.aspects["agent-skill"].state = "PENDING";
            expect(
                (
                    await caught(
                        service.installations.install(
                            { sourceSkillId: SOURCE },
                            bob
                        )
                    )
                ).code
            ).to.equal("AGENT_SKILL_SOURCE_PENDING");
            world.publication(SOURCE)!.aspects["agent-skill"].state = "READY";
            world.publication(SOURCE)!.tenantId = 1;
            expect(
                (
                    await caught(
                        service.installations.install(
                            { sourceSkillId: SOURCE },
                            bob
                        )
                    )
                ).status
            ).to.equal(404);
        });

        it("lists the recipient's installations with source status", async () => {
            await service.installations.install({ sourceSkillId: SOURCE }, bob);
            const page = await service.installations.list({ limit: 20 }, bob);
            expect(page.items).to.have.length(1);
            const [item] = page.items as any[];
            expect(item.source.status).to.equal("available");
            expect(item.source.skill.id).to.equal(SOURCE);
            expect(
                (await service.installations.list({ limit: 20 }, carol)).items
            ).to.deep.equal([]);
            // Revoked: the record stays, publisher metadata is withheld.
            await service.access.removeRecipient("user", SOURCE, bob.id, alice);
            const [revoked] = (
                await service.installations.list({ limit: 20 }, bob)
            ).items as any[];
            expect(revoked.source).to.deep.equal({ status: "unavailable" });
            expect(
                (await service.installations.get(BOB_INSTALL, bob)).source
            ).to.deep.equal({ status: "unavailable" });
        });

        it("uninstalls only the recipient's record, even after revocation or deletion", async () => {
            await service.installations.install({ sourceSkillId: SOURCE }, bob);
            await service.access.removeRecipient("user", SOURCE, bob.id, alice);
            const otherUser = await caught(
                service.installations.uninstall(BOB_INSTALL, carol)
            );
            expect(otherUser.status).to.equal(404);
            await service.installations.uninstall(BOB_INSTALL, bob);
            expect(world.records.has(BOB_INSTALL)).to.equal(false);
            expect(world.publication(SOURCE)).to.not.equal(undefined);
            expect(world.archives.size).to.equal(1);
            expect(
                world.calls.find(
                    (call) => call.operation === "deleteInstallation"
                )!.token
            ).to.equal(bob.sessionToken);
            // A publication with an installation-shaped ID is not uninstallable.
            await service.createAuthorized(
                "user",
                await skillZip("own-skill"),
                bob
            );
            expect(
                (
                    await caught(
                        service.installations.uninstall(
                            `agent-skill-${bob.id}-own-skill`,
                            bob
                        )
                    )
                ).status
            ).to.equal(404);
        });

        it("keeps a malformed own installation visible and removable", async () => {
            world.records.set(`agent-skill-${bob.id}-broken`, {
                id: `agent-skill-${bob.id}-broken`,
                name: "broken",
                aspects: {
                    "agent-skill-installation": {
                        userId: bob.id,
                        sourceSkillId: "nonsense"
                    },
                    "access-control": { ownerId: bob.id }
                }
            });
            expect(
                (await service.installations.list({ limit: 20 }, bob)).items
            ).to.deep.include({
                id: `agent-skill-${bob.id}-broken`,
                problem: "INVALID_RECORD"
            });
            const manifest = await service.getWorkspaceSkillManifest(bob);
            expect(manifest.warnings).to.deep.equal([
                {
                    sourceKind: "installation",
                    code: "INVALID_RECORD",
                    recordId: `agent-skill-${bob.id}-broken`
                }
            ]);
            await service.installations.uninstall(
                `agent-skill-${bob.id}-broken`,
                bob
            );
            expect(world.records.has(`agent-skill-${bob.id}-broken`)).to.equal(
                false
            );
        });
    });

    describe("manifests", () => {
        beforeEach(async () => {
            await share();
            await service.installations.install(
                { sourceSkillId: SOURCE, alias: "team-csv" },
                bob
            );
        });

        it("adds explicitly installed shared sources to Workspace and local manifests", async () => {
            const workspace = await service.getWorkspaceSkillManifest(bob);
            const installed = workspace.items.find(
                (item) => item.sourceKind === "installation"
            )!;
            expect(installed).to.deep.include({
                selectionId: `agent-skill-${bob.id}-team-csv`,
                effectiveName: "team-csv"
            });
            expect(installed.installation).to.deep.equal({
                id: `agent-skill-${bob.id}-team-csv`,
                userId: bob.id,
                sourceSkillId: SOURCE,
                alias: "team-csv"
            });
            expect(installed.source).to.deep.include({
                id: SOURCE,
                userId: alice.id,
                checksum: world.publication(SOURCE)!.aspects["agent-skill"]
                    .checksum
            });
            expect(workspace.sources.installations).to.deep.equal({
                complete: true,
                count: 1,
                unavailable: 0
            });
            const local = await service.getLocalSkillSyncManifest(bob);
            expect(local.items.map((item) => item.selectionId)).to.deep.equal([
                `agent-skill-${bob.id}-team-csv`
            ]);
            // Another recipient's manifest never sees Bob's installation.
            expect(
                (await service.getLocalSkillSyncManifest(carol)).items
            ).to.deep.equal([]);
        });

        it("reports a revoked or deleted source as a definitive unavailable installation", async () => {
            await service.access.removeRecipient("user", SOURCE, bob.id, alice);
            const revoked = await service.getWorkspaceSkillManifest(bob);
            expect(revoked.items).to.deep.equal([]);
            expect(revoked.warnings).to.deep.equal([]);
            expect(revoked.unavailableInstallations).to.deep.equal([
                {
                    installationId: `agent-skill-${bob.id}-team-csv`,
                    effectiveName: "team-csv",
                    sourceSkillId: SOURCE,
                    code: "SOURCE_UNAVAILABLE"
                }
            ]);
            await share();
            const record = await service.prepareExisting(
                "user",
                SOURCE,
                "delete",
                alice
            );
            await service.deleteAuthorized(
                record,
                alice,
                record.aspects["agent-skill"].checksum
            );
            const deleted = await service.getLocalSkillSyncManifest(bob);
            expect(deleted.unavailableInstallations).to.have.length(1);
            expect(deleted.warnings).to.deep.equal([]);
        });

        it("treats a pending source as uncertain, not as removal", async () => {
            world.publication(SOURCE)!.aspects["agent-skill"].state = "PENDING";
            const manifest = await service.getWorkspaceSkillManifest(bob);
            expect(manifest.items).to.deep.equal([]);
            expect(manifest.unavailableInstallations).to.deep.equal([]);
            expect(manifest.warnings).to.deep.equal([
                {
                    sourceKind: "installation",
                    code: "SOURCE_PENDING",
                    recordId: `agent-skill-${bob.id}-team-csv`
                }
            ]);
        });

        it("fails the whole manifest on Registry, installation or OPA outages", async () => {
            for (const failure of [
                `registry.get:${SOURCE}`,
                "registry.listInstallations",
                "opa"
            ]) {
                world.failures.set(
                    failure,
                    new DownstreamServiceError(
                        failure === "opa" ? "authorization" : "registry",
                        503,
                        "unavailable"
                    )
                );
                const error = await caught(
                    service.getWorkspaceSkillManifest(bob)
                );
                expect(error, failure).to.be.instanceOf(DownstreamServiceError);
                expect(world.failures.has(failure)).to.equal(false);
            }
        });

        it("treats a cross-tenant source as unavailable", async () => {
            world.publication(SOURCE)!.tenantId = 7;
            const manifest = await service.getWorkspaceSkillManifest(bob);
            expect(manifest.items).to.deep.equal([]);
            expect(manifest.unavailableInstallations).to.have.length(1);
        });
    });

    describe("system skill access", () => {
        const SYSTEM = "agent-skill-system-report";

        beforeEach(async () => {
            await service.createAuthorized(
                "system",
                await skillZip("system-report"),
                sysmgr
            );
        });

        it("is public to holders of the typed system read by default", async () => {
            expect(
                await service.access.getAccess("system", SYSTEM, sysmgr)
            ).to.deep.equal({
                id: SYSTEM,
                type: "system",
                public: true,
                recipients: { count: 0 }
            });
            expect(
                (await service.prepareExisting("system", SYSTEM, "read", bob))
                    .id
            ).to.equal(SYSTEM);
        });

        it("keeps OrgUnit and selected users when Public is toggled", async () => {
            await service.access.updateSystemAccess(
                "system",
                SYSTEM,
                { orgUnitId: ORG },
                sysmgr
            );
            await service.access.addRecipient("system", SYSTEM, bob.id, sysmgr);
            const restricted = await service.access.updateSystemAccess(
                "system",
                SYSTEM,
                { public: false },
                sysmgr
            );
            expect(restricted).to.deep.equal({
                id: SYSTEM,
                type: "system",
                public: false,
                orgUnitId: ORG,
                recipients: { count: 1 }
            });
            const [group] = [...world.groups.values()];
            expect(group.resourceUri).to.equal("object/agentSkill/system");
            expect(group.operationUris).to.deep.equal([
                "object/agentSkill/system/read"
            ]);
            // Restricted: the selected user still reads it, others do not.
            await service.prepareExisting("system", SYSTEM, "read", bob);
            expect(
                (
                    await caught(
                        service.prepareExisting("system", SYSTEM, "read", carol)
                    )
                ).status
            ).to.equal(404);
            const reopened = await service.access.updateSystemAccess(
                "system",
                SYSTEM,
                { public: true },
                sysmgr
            );
            expect(reopened.orgUnitId).to.equal(ORG);
            expect(reopened.recipients).to.deep.equal({ count: 1 });
            const cleared = await service.access.updateSystemAccess(
                "system",
                SYSTEM,
                { orgUnitId: null },
                sysmgr
            );
            expect(cleared.orgUnitId).to.equal(undefined);
        });

        it("validates settings and the manager's authority", async () => {
            expect(
                (
                    await caught(
                        service.access.updateSystemAccess(
                            "system",
                            SYSTEM,
                            {
                                orgUnitId:
                                    "00000000-0000-4000-8000-0000000000f9"
                            },
                            sysmgr
                        )
                    )
                ).code
            ).to.equal("INVALID_ORG_UNIT");
            expect(
                (
                    await caught(
                        service.access.updateSystemAccess(
                            "system",
                            SYSTEM,
                            { public: "yes" },
                            sysmgr
                        )
                    )
                ).code
            ).to.equal("INVALID_ACCESS_SETTINGS");
            expect(
                (
                    await caught(
                        service.access.updateSystemAccess(
                            "user",
                            SOURCE,
                            { public: true },
                            alice
                        )
                    )
                ).code
            ).to.equal("AGENT_SKILL_ACCESS_NOT_CONFIGURABLE");
            for (const user of [alice, bob]) {
                expect(
                    (
                        await caught(
                            service.access.updateSystemAccess(
                                "system",
                                SYSTEM,
                                { public: false },
                                user
                            )
                        )
                    ).status
                ).to.equal(404);
            }
            expect(
                world.publication(SYSTEM)!.aspects["access-control"]
                    .constraintExemption
            ).to.equal(true);
        });

        it("cannot be installed as a shared user skill", async () => {
            expect(
                (
                    await caught(
                        service.installations.install(
                            { sourceSkillId: SYSTEM },
                            bob
                        )
                    )
                ).code
            ).to.equal("INVALID_SOURCE_SKILL_ID");
        });
    });

    describe("publishing an installed copy as the recipient's own skill", () => {
        const FORK = `agent-skill-${bob.id}-team-csv`;

        beforeEach(async () => {
            await share();
            await service.installations.install(
                { sourceSkillId: SOURCE, alias: "team-csv" },
                bob
            );
        });

        function sourceSnapshot() {
            const record = world.publication(SOURCE)!;
            return JSON.stringify({
                record,
                archive: world.archives
                    .get(record.aspects["agent-skill"].archiveKey)!
                    .bytes.toString("base64")
            });
        }

        it("replaces the installation with the recipient's own publication", async () => {
            const before = sourceSnapshot();
            const result = await service.installations.fork(
                FORK,
                await skillZip("team-csv", "edited", "Bob's version."),
                bob
            );
            expect(result.installationRemoved).to.equal(true);
            expect(result.publication).to.deep.include({
                id: FORK,
                type: "user",
                userId: bob.id,
                ownerId: bob.id,
                createdBy: bob.id
            });
            expect(
                world.records.get(FORK).aspects["agent-skill-installation"]
            ).to.equal(undefined);
            expect(sourceSnapshot()).to.equal(before);
            const manifest = await service.getLocalSkillSyncManifest(bob);
            expect(
                manifest.items.map((item) => [
                    item.sourceKind,
                    item.selectionId
                ])
            ).to.deep.equal([["own-user-publication", FORK]]);
        });

        it("works after the original source was revoked", async () => {
            await service.access.removeRecipient("user", SOURCE, bob.id, alice);
            const before = sourceSnapshot();
            const result = await service.installations.fork(
                FORK,
                await skillZip("team-csv", "edited"),
                bob
            );
            expect(result.publication.id).to.equal(FORK);
            expect(sourceSnapshot()).to.equal(before);
        });

        it("checks the name and both permissions before removing the installation", async () => {
            const mismatch = await caught(
                service.installations.fork(
                    FORK,
                    await skillZip("other-name"),
                    bob
                )
            );
            expect(mismatch.code).to.equal("AGENT_SKILL_FORK_NAME_MISMATCH");
            world.installers.delete(bob.id);
            const forbidden = await caught(
                service.installations.fork(
                    FORK,
                    await skillZip("team-csv"),
                    bob
                )
            );
            expect(forbidden.status).to.equal(403);
            expect(
                world.records.get(FORK).aspects["agent-skill-installation"]
            ).to.not.equal(undefined);
            expect(
                (
                    await caught(
                        service.installations.fork(
                            FORK,
                            await skillZip("team-csv"),
                            carol
                        )
                    )
                ).status
            ).to.equal(404);
        });

        it("reports an incomplete fork and completes it on retry", async () => {
            const key = `agent-services/skills/user-skills/${bob.id}/${FORK}.zip`;
            world.failures.set(
                `storage.upload:${key}`,
                new DownstreamServiceError("storage", 503, "unavailable")
            );
            const bytes = await skillZip("team-csv", "edited");
            const error = await caught(
                service.installations.fork(FORK, bytes, bob)
            );
            expect(error.code).to.equal("AGENT_SKILL_FORK_INCOMPLETE");
            expect(error.retryable).to.equal(true);
            expect(error.details).to.deep.include({
                installationRemoved: true
            });
            expect(
                world.records.get(FORK)?.aspects["agent-skill-installation"]
            ).to.equal(undefined);
            const retried = await service.installations.fork(FORK, bytes, bob);
            expect(retried.installationRemoved).to.equal(false);
            expect(retried.publication.id).to.equal(FORK);
            expect(
                world.records.get(FORK).aspects["agent-skill"].state
            ).to.equal("READY");
        });
    });
});
