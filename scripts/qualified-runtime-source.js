// Only the Agent Runtime has digest-bound qualification artifacts. Other image
// producers keep their existing version/tag flow; never apply this digest to them.
export function getRetagSource({ prefix = "", name, version, qualifiedRuntimeSource }) {
    const ordinary = `${prefix}${name}:${version}`;
    if (name !== "magda-agent-runtime" || !qualifiedRuntimeSource) return ordinary;
    const expected = `${prefix}${name}@`;
    if (!qualifiedRuntimeSource.startsWith(expected) ||
        !/^sha256:[0-9a-f]{64}$/.test(qualifiedRuntimeSource.slice(expected.length))) {
        throw new Error("Qualified Agent Runtime source must be this repository's immutable SHA256 reference");
    }
    return qualifiedRuntimeSource;
}
