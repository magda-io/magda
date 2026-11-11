#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { defaultReferences, verifyEvidence, archivedFile } from './verify-source-references.mjs';

const digest = 'sha256:' + 'a'.repeat(64);
const hash = x => createHash('sha256').update(x).digest('hex');
function fixture(architecture = 'arm64') {
    const refs = structuredClone(defaultReferences);
    const evidence = { image: { id: digest, architecture, os: 'linux' }, inventory: { schemaVersion: 1, nodePackages: [], licenseFiles: [], sourceMetadata: [], nativeBinaries: [] } };
    function add(origin, sha256, content) { evidence.inventory.sourceMetadata.push({ path: origin, sha256, ...(content === undefined ? {} : { content }) }); }
    for (const ref of Object.values(refs.components).filter(x => x.architecture === architecture)) {
        evidence.inventory.nodePackages.push({ name: ref.name, version: ref.version, path: ref.packagePath });
        for (const f of ref.requiredFiles) add(`${ref.packagePath}/${f.path}`, f.sha256);
        if (ref.coreSource) evidence.inventory.sourceMetadata.find(f => f.path.endsWith('/sources/core-source.json')).content = structuredClone(ref.coreSource);
        if (ref.verifyReceipt) {
            // Real receipt is hash-pinned by manifest; fixture tests use their own pinned receipt.
            const content = JSON.stringify({ version: ref.version, platform: 'wasm', status: 'built', source: { ...ref.coreSource, files: ['sources/source-changes.patch'] }, files: { 'sources/source-changes.patch': ref.requiredFiles.find(f => f.path === 'sources/source-changes.patch').sha256, [ref.wasmBinary.path]: ref.wasmBinary.sha256 } });
            ref.requiredFiles.find(f => f.path === ref.verifyReceipt).sha256 = hash(content);
            const f = evidence.inventory.sourceMetadata.find(f => f.path.endsWith('/prebuilds.json'));
            f.content = content; f.sha256 = hash(content);
        }
        if (ref.wasmBinary) evidence.inventory.nativeBinaries.push({ path: `${ref.packagePath}/${ref.wasmBinary.path}`, sha256: ref.wasmBinary.sha256, format: 'WASM', size: ref.wasmBinary.size });
        if (ref.embeddedVersions) evidence.inventory.sourceMetadata.find(f => f.path === `${ref.packagePath}/versions.json`).content = structuredClone(ref.embeddedVersions);
        if (ref.sharedLinkage) evidence.inventory.nativeBinaries.push({ path: `${ref.packagePath}/${ref.sharedLinkage.path}`, sha256: ref.sharedLinkage.sha256, format: 'ELF64', machine: architecture === 'arm64' ? 'AArch64' : 'x86_64', needed: [ref.sharedLinkage.needed] });
        if (ref.sharedLibrary) evidence.inventory.nativeBinaries.push({ path: `${ref.packagePath}/${ref.sharedLibrary.path}`, sha256: ref.sharedLibrary.sha256, format: 'ELF', machine: architecture === 'arm64' ? 183 : 62, needed: ['libc.so.6'] });
    }
    return { refs, evidence };
}
const verify = ({ refs, evidence }, options) => verifyEvidence(evidence, { references: refs, ...options });

test('current reviewed versions produce evidence success, never compliance success', () => {
    const r = verify(fixture());
    assert.deepEqual(r.errors, []);
    assert.equal(r.checkedComponents.length, 5);
    assert.equal(r.complianceStatus, 'not-assessed');
    assert.ok(r.unresolved.some(x => /Full license texts/.test(x.issue)));
    assert.ok(r.unresolved.some(x => /claims only/.test(x.issue)));
    assert.match(r.evidenceStatus, /unresolved/);
});
test('AMD64 references use actual x64 artifact identities, not ARM binary hashes', () => {
    const f = fixture('amd64');
    assert.deepEqual(verify(f).errors, []);
    assert.ok(verify(f).checkedComponents.includes('@img/sharp-linux-x64@0.35.3/linux-amd64'));
    f.evidence.inventory.nativeBinaries.find(x => x.path.endsWith('.node')).sha256 = defaultReferences.components['@img/sharp-linux-arm64@0.35.3/linux-arm64'].sharedLinkage.sha256;
    assert.ok(verify(f).errors.some(x => /Reference hash mismatch/.test(x)));
});
test('missing notices and changed notice bytes fail', () => {
    const f = fixture();
    f.evidence.inventory.sourceMetadata = f.evidence.inventory.sourceMetadata.filter(x => !x.path.endsWith('/licenses/NOTICE'));
    assert.ok(verify(f).errors.some(x => /Missing evidence file.*licenses\/NOTICE/.test(x)));
    const g = fixture(); g.evidence.inventory.sourceMetadata[0].sha256 = '0'.repeat(64);
    assert.ok(verify(g).errors.some(x => /Reference hash mismatch/.test(x)));
});
test('new version and other architecture require review, not dependency changes', () => {
    const f = fixture(); f.evidence.inventory.nodePackages[0].version = '9.9.9';
    assert.ok(verify(f).errors.some(x => /Unreviewed.*9.9.9/.test(x)));
    const g = fixture(); g.evidence.image.architecture = 'riscv64';
    assert.equal(verify(g).checkedComponents.length, 0);
});
test('dynamic caller version assertion is checked against final inventory', () => {
    assert.deepEqual(verify(fixture(), { versions: ['sharp=0.35.3'] }).errors, []);
    assert.ok(verify(fixture(), { versions: ['sharp=0.34.0'] }).errors.some(x => /source-version assertion/.test(x)));
});
test('core revision, receipt, embedded versions, and actual shared linkage are checked', () => {
    const f = fixture();
    f.evidence.inventory.sourceMetadata.find(x => x.path.endsWith('/core-source.json')).content.revision = '0'.repeat(40);
    assert.ok(verify(f).errors.some(x => /core source mismatch/.test(x)));
    const g = fixture(); g.evidence.inventory.sourceMetadata.find(x => x.path.endsWith('/versions.json')).content.heif = '1.23.0';
    assert.ok(verify(g).errors.some(x => /Embedded heif version mismatch/.test(x)));
    const h = fixture(); h.evidence.inventory.nativeBinaries.find(x => x.path.endsWith('.node')).needed = [];
    assert.ok(verify(h).errors.some(x => /DT_NEEDED/.test(x)));
    const i = fixture(); i.evidence.inventory.nativeBinaries.pop();
    assert.ok(verify(i).errors.some(x => /actual arm64 ELF/.test(x)));
});
test('WASM binary is tied to the source receipt, not only package version', () => {
    const f = fixture();
    f.evidence.inventory.nativeBinaries.find(x => x.format === 'WASM').sha256 = '0'.repeat(64);
    assert.ok(verify(f).errors.some(x => /Reference hash mismatch.*soffice.wasm/.test(x)));
    const g = fixture(); g.evidence.inventory.nativeBinaries.find(x => x.format === 'WASM').size--;
    assert.ok(verify(g).errors.some(x => /WASM binary\/receipt identity mismatch/.test(x)));
});
test('image identity must be immutable, not a mutable tag', () => {
    const f = fixture(); f.evidence.image.id = 'magda-agent-runtime:latest';
    assert.ok(verify(f).errors.some(x => /immutable image.id/.test(x)));
});
test('archive helper rejects traversal, absolute destinations and symlink escapes', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'magda-source-test-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'magda-source-outside-'));
    writeFileSync(path.join(outside, 'notice'), 'outside');
    mkdirSync(path.join(dir, 'evidence')); symlinkSync(path.join(outside, 'notice'), path.join(dir, 'evidence', 'notice'));
    for (const archivePath of ['../escape', '/tmp/escape', 'evidence/notice']) assert.throws(() => archivedFile(dir, { path: '/notice', archivePath }));
    assert.throws(() => archivedFile(dir, { path: '/a/../notice' }));
});
test('directory evidence rehashes copies rather than trusting manifest inventory', () => {
    const f = fixture(), dir = mkdtempSync(path.join(tmpdir(), 'magda-source-copies-'));
    for (const entry of f.evidence.inventory.sourceMetadata) {
        const dest = path.join(dir, 'evidence', entry.path.slice(1)); mkdirSync(path.dirname(dest), { recursive: true }); writeFileSync(dest, 'tampered');
    }
    assert.ok(verify(f, { evidenceDir: dir }).errors.some(x => /Copied file hash mismatch/.test(x)));
});
test('collector package.json paths and valid archived copies are accepted', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'magda-source-valid-'));
    const notice = 'Third-party fixture notice\n', own = 'Separate MAGDA license fixture\n';
    mkdirSync(path.join(dir, 'evidence/pkg'), { recursive: true }); mkdirSync(path.join(dir, 'licenses'));
    writeFileSync(path.join(dir, 'evidence/pkg/LICENSE'), notice); writeFileSync(path.join(dir, 'licenses/MAGDA.txt'), own);
    const references = { components: { 'fixture@1/linux-arm64': { name: 'fixture', version: '1', architecture: 'arm64', packagePath: '/pkg', requiredFiles: [{ path: 'LICENSE', sha256: hash(notice) }], unresolved: [] } }, magdaLicense: { bundlePath: 'licenses/MAGDA.txt', sha256: hash(own) } };
    const evidence = { image: { id: digest, architecture: 'arm64', os: 'linux' }, inventory: { schemaVersion: 1, nodePackages: [{ name: 'fixture', version: '1', path: '/pkg/package.json' }], licenseFiles: [{ path: '/pkg/LICENSE', sha256: hash(notice), bytes: Buffer.byteLength(notice) }] } };
    const result = verifyEvidence(evidence, { references, evidenceDir: dir });
    assert.deepEqual(result.errors, []); assert.deepEqual(result.unresolved, []);
    assert.ok(result.checks.includes('MAGDA-owned license licenses/MAGDA.txt'));
});
test('CLI strict mode returns 2 for unresolved obligations, not a false success', () => {
    const f = fixture(), dir = mkdtempSync(path.join(tmpdir(), 'magda-source-cli-'));
    const input = path.join(dir, 'input.json'), refs = path.join(dir, 'refs.json');
    writeFileSync(input, JSON.stringify(f.evidence)); writeFileSync(refs, JSON.stringify(f.refs));
    const result = spawnSync(process.execPath, [new URL('./verify-source-references.mjs', import.meta.url).pathname, '--evidence', input, '--references', refs, '--require-resolved'], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert.deepEqual(JSON.parse(result.stdout).errors, []);
    assert.equal(JSON.parse(result.stdout).complianceStatus, 'not-assessed');
});
test('CLI rejects contradictory evidence inputs and has documented help', () => {
    const url = new URL('./verify-source-references.mjs', import.meta.url);
    const help = spawnSync(process.execPath, [url.pathname, '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0); assert.match(help.stdout, /require-resolved/);
    const bad = spawnSync(process.execPath, [url.pathname, '--evidence', 'x', '--evidence-dir', 'y'], { encoding: 'utf8' });
    assert.equal(bad.status, 1); assert.match(bad.stderr, /exactly one/);
});
