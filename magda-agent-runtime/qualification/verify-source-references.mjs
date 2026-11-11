#!/usr/bin/env node
/** Offline evidence verification, not a legal-compliance decision. No network/builds. */
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export function expandReferences(raw) {
    const resolved = {};
    function resolve(key, seen = new Set()) {
        if (resolved[key]) return resolved[key];
        const entry = raw.components[key];
        if (!entry || seen.has(key)) throw new Error(`Missing/cyclic source reference: ${key}`);
        const next = new Set([...seen, key]);
        return resolved[key] = { ...(entry.extends ? resolve(entry.extends, next) : {}), ...entry };
    }
    for (const key of Object.keys(raw.components)) resolve(key);
    return { ...raw, components: resolved };
}
function loadReferences(filename) {
    const bytes = readFileSync(filename);
    return { ...expandReferences(JSON.parse(bytes.toString('utf8'))), manifestSha256: createHash('sha256').update(bytes).digest('hex') };
}
export const defaultReferences = loadReferences(new URL('./source-references.json', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

// Refuse path traversal and symlink escapes when reading collector copies.
export function archivedFile(root, entry) {
    if (typeof entry.path !== 'string' || !entry.path.startsWith('/')) throw new Error('Evidence origin must be an absolute image path');
    if (entry.path.split('/').includes('..')) throw new Error('Unsafe image path');
    const relative = entry.archivePath || `evidence/${entry.path.slice(1)}`;
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Unsafe archivePath');
    const base = realpathSync(root);
    const candidate = realpathSync(path.resolve(base, relative));
    if (!candidate.startsWith(`${base}${path.sep}`) || !statSync(candidate).isFile()) throw new Error('Archived evidence escapes directory or is not a regular file');
    return candidate;
}

export function verifyEvidence(evidence, { references = defaultReferences, evidenceDir, versions = [] } = {}) {
    const image = evidence.image || evidence.imageMetadata || {};
    const inventory = evidence.inventory || evidence;
    const errors = [], unresolved = [], checks = [], checkedComponents = [];
    const fail = message => errors.push(message);
    const check = message => checks.push(message);
    if (references.schemaVersion !== undefined && references.schemaVersion !== 1) fail('Unsupported source-reference schemaVersion');
    if (inventory.schemaVersion !== 1) fail('Unsupported/missing inventory schemaVersion');
    if (!digestPattern.test(image.id || '')) fail('Missing immutable image.id sha256 identity');
    if (image.digest && !digestPattern.test(image.digest)) fail('Malformed image.digest');
    const architecture = image.architecture;
    if (!architecture) fail('Missing image architecture');
    const os = image.os || 'linux';
    // Collector path identifies the manifest; direct fixtures may identify its root.
    const packages = (inventory.nodePackages || []).map(pkg => ({ ...pkg, path: typeof pkg.path === 'string' && pkg.path.endsWith('/package.json') ? path.posix.dirname(pkg.path) : pkg.path }));
    const allFiles = [...(inventory.licenseFiles || []), ...(inventory.sourceMetadata || []), ...(inventory.files || []), ...(inventory.nativeBinaries || [])];
    const byPath = new Map();
    for (const f of allFiles) {
        if (byPath.has(f.path) && byPath.get(f.path).sha256 !== f.sha256) fail(`Conflicting file hashes: ${f.path}`);
        // Prefer a record with content/archivePath if duplicated in native inventory.
        byPath.set(f.path, { ...byPath.get(f.path), ...f });
    }
    const verified = new Map();
    function file(origin, expectedHash, copyRequired = true) {
        const f = byPath.get(origin);
        if (!f) { fail(`Missing evidence file: ${origin}`); return; }
        if (!hashPattern.test(f.sha256 || '')) { fail(`Missing/invalid sha256: ${origin}`); return; }
        if (expectedHash && f.sha256 !== expectedHash) fail(`Reference hash mismatch: ${origin}`);
        let content = f.content;
        if (evidenceDir && copyRequired && !verified.has(origin)) {
            try {
                const bytes = readFileSync(archivedFile(evidenceDir, f));
                if (sha256(bytes) !== f.sha256) fail(`Copied file hash mismatch: ${origin}`);
                if (f.bytes !== undefined && bytes.length !== f.bytes) fail(`Copied file byte count mismatch: ${origin}`);
                content = bytes.toString('utf8');
                verified.set(origin, content);
            } catch (e) { fail(`Cannot verify copied file ${origin}: ${e.message}`); }
        } else if (verified.has(origin)) content = verified.get(origin);
        if (typeof content === 'string' && sha256(content) !== f.sha256) fail(`Inline content hash mismatch: ${origin}`);
        // Parsed JSON content cannot reproduce whitespace; only a copied file authenticates it.
        check(`${copyRequired && evidenceDir ? 'copied' : 'inventory'} file ${origin}`);
        return { ...f, content };
    }
    function json(origin) {
        const f = file(origin);
        if (!f) return;
        try {
            if (typeof f.content === 'string') return JSON.parse(f.content);
            if (f.content && typeof f.content === 'object') return f.content;
            fail(`Missing source JSON content: ${origin}`);
        } catch (e) { fail(`Invalid source JSON ${origin}: ${e.message}`); }
    }
    const matchingReferences = Object.values(references.components).filter(x => x.architecture === architecture);
    if (!matchingReferences.length) fail(`Unreviewed architecture: ${architecture}`);
    const expectedNames = [...new Set(matchingReferences.map(x => x.name))];
    const machines = architecture === 'arm64' ? [183, 'AArch64', 'aarch64', 'ARM64', 'arm64'] : [62, 'x86_64', 'amd64', 'X86-64'];
    // This intentionally fails unknown versions/architectures, without changing the lock.
    for (const name of expectedNames) {
        const installed = packages.filter(p => p.name === name);
        if (!installed.length) { fail(`Required component missing: ${name}`); continue; }
        for (const pkg of installed) {
            const key = `${name}@${pkg.version}/${os}-${architecture}`;
            const ref = references.components[key];
            if (!ref) { fail(`Unreviewed component/version/architecture: ${key}`); continue; }
            if (pkg.path !== ref.packagePath) { fail(`Unexpected package path: ${pkg.path} (expected ${ref.packagePath})`); continue; }
            checkedComponents.push(key);
            for (const item of ref.requiredFiles) file(`${pkg.path}/${item.path}`, item.sha256);
            for (const gap of ref.unresolved || []) unresolved.push({ component: key, issue: gap });
            if (ref.coreSource) {
                const core = json(`${pkg.path}/sources/core-source.json`);
                if (core?.repository !== ref.coreSource.repository || core?.revision !== ref.coreSource.revision) fail(`LibreOffice immutable core source mismatch: ${key}`);
            }
            if (ref.verifyReceipt) {
                const receipt = json(`${pkg.path}/${ref.verifyReceipt}`);
                if (receipt?.version !== pkg.version || receipt?.platform !== 'wasm' || receipt?.status !== 'built') fail(`WASM receipt identity mismatch: ${key}`);
                if (receipt?.source?.revision !== ref.coreSource.revision || receipt?.source?.repository !== ref.coreSource.repository) fail(`WASM receipt source mismatch: ${key}`);
                if (ref.wasmBinary) {
                    const origin = `${pkg.path}/${ref.wasmBinary.path}`;
                    const binary = file(origin, ref.wasmBinary.sha256, false);
                    const native = (inventory.nativeBinaries || []).find(f => f.path === origin);
                    if (!binary || native?.format !== 'WASM' || native?.size !== ref.wasmBinary.size || receipt?.files?.[ref.wasmBinary.path] !== ref.wasmBinary.sha256) fail(`WASM binary/receipt identity mismatch: ${origin}`);
                    else check(`actual WASM binary matches shipped source receipt ${origin}`);
                }
                const sources = receipt?.source?.files;
                if (!Array.isArray(sources) || !sources.length) fail(`WASM receipt lacks source file inventory: ${key}`);
                for (const relative of sources || []) {
                    if (typeof relative !== 'string' || !relative.startsWith('sources/') || relative.split('/').includes('..')) { fail('Unsafe WASM receipt source path'); continue; }
                    const hash = receipt.files?.[relative];
                    if (!hashPattern.test(hash || '')) { fail(`Receipt lacks source sha256: ${relative}`); continue; }
                    file(`${pkg.path}/${relative}`, hash);
                }
            }
            if (ref.embeddedVersions) {
                const embedded = json(`${pkg.path}/versions.json`);
                for (const [name, version] of Object.entries(ref.embeddedVersions)) if (embedded?.[name] !== version) fail(`Embedded ${name} version mismatch: expected ${version}, got ${embedded?.[name]}`);
            }
            if (ref.sharedLinkage) {
                const origin = `${pkg.path}/${ref.sharedLinkage.path}`;
                const binary = file(origin, ref.sharedLinkage.sha256, false);
                const native = (inventory.nativeBinaries || []).find(f => f.path === origin);
                if (!binary || !native || !/ELF/i.test(native.format || '') || !machines.includes(native.machine) || !Array.isArray(native.needed) || !native.needed.includes(ref.sharedLinkage.needed)) fail(`Missing ELF ${architecture} DT_NEEDED shared libvips proof: ${origin}`);
                else check(`shared linkage ${origin} -> ${ref.sharedLinkage.needed}`);
            }
            if (ref.sharedLibrary) {
                const origin = `${pkg.path}/${ref.sharedLibrary.path}`;
                file(origin, ref.sharedLibrary.sha256, false);
                const native = (inventory.nativeBinaries || []).find(f => f.path === origin);
                if (!native || !/ELF/i.test(native.format || '') || !machines.includes(native.machine)) fail(`Missing actual ${architecture} ELF libvips shared object: ${origin}`);
                else check(`existing shared object ${origin}`);
            }
        }
    }
    for (const assertion of versions) {
        const i = assertion.lastIndexOf('=');
        const name = assertion.slice(0, i), version = assertion.slice(i + 1);
        if (i <= 0 || !version || !packages.some(p => p.name === name && p.version === version)) fail(`Requested source-version assertion not present in final image: ${assertion}`);
    }
    // This is a separate bundle license, never a third-party catch-all.
    const own = references.magdaLicense;
    if (evidenceDir) {
        try {
            const license = archivedFile(evidenceDir, { path: '/MAGDA-LICENSE', archivePath: own.bundlePath });
            if (sha256(readFileSync(license)) !== own.sha256) fail('MAGDA own Apache license hash mismatch');
            else check(`MAGDA-owned license ${own.bundlePath}`);
        } catch { unresolved.push({ component: 'MAGDA', issue: `Own Apache license not verified in bundle at ${own.bundlePath}; copy repository LICENSE separately from dependency notices.` }); }
    } else unresolved.push({ component: 'evidence', issue: 'JSON claims only: no archived license/source copies rehashed and no own MAGDA license bundle verified.' });
    return {
        schemaVersion: 1, image, sourceReferencesSha256: references.manifestSha256 || null, assurance: evidenceDir ? 'copied-notice-source-files-rehashed; native-ELF-inventory-claims' : 'supplied-inventory-claims-only',
        evidenceStatus: errors.length ? 'failed' : unresolved.length ? 'verified-with-unresolved-obligations' : 'verified',
        complianceStatus: 'not-assessed', checkedComponents, checks, errors, unresolved,
        note: 'SBOM and passing evidence checks do not establish source completeness, legal compliance, or successful recipient library replacement.'
    };
}

export function main(argv = process.argv.slice(2)) {
    const { values } = parseArgs({ args: argv, options: {
        'evidence-dir': { type: 'string' }, evidence: { type: 'string' }, references: { type: 'string' }, output: { type: 'string' },
        'component-version': { type: 'string', multiple: true }, 'require-resolved': { type: 'boolean', default: false }, help: { type: 'boolean' }
    } });
    if (values.help) {
        console.log('Usage: node verify-source-references.mjs (--evidence-dir DIR | --evidence JSON) [--output JSON] [--component-version NAME=VERSION] [--require-resolved]');
        return 0;
    }
    if (Boolean(values['evidence-dir']) === Boolean(values.evidence)) throw new Error('Choose exactly one --evidence-dir or --evidence');
    const dir = values['evidence-dir'];
    const evidence = dir ? {
        image: JSON.parse(readFileSync(path.join(dir, 'image-metadata.json'), 'utf8')),
        inventory: JSON.parse(readFileSync(path.join(dir, 'inventory.json'), 'utf8'))
    } : JSON.parse(readFileSync(values.evidence, 'utf8'));
    const references = values.references ? loadReferences(values.references) : defaultReferences;
    const report = verifyEvidence(evidence, { evidenceDir: dir, references, versions: values['component-version'] || [] });
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (values.output) writeFileSync(values.output, text);
    else process.stdout.write(text);
    return report.errors.length ? 1 : values['require-resolved'] && report.unresolved.length ? 2 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { process.exitCode = main(); }
    catch (e) { console.error(e.message); process.exitCode = 1; }
}
