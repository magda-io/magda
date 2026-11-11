import assert from "node:assert/strict";
import test from "node:test";
import { getRetagSource } from "../../scripts/qualified-runtime-source.js";

const prefix = "registry.gitlab.com/magda-data/magda/";
const reference = `${prefix}magda-agent-runtime@sha256:${"a".repeat(64)}`;

test("runtime promotion uses the exact qualified digest instead of mutable branch tag", () => {
    assert.equal(getRetagSource({prefix,name:"magda-agent-runtime",version:"next",qualifiedRuntimeSource:reference}),reference);
});
test("the runtime digest never applies to other component images", () => {
    assert.equal(getRetagSource({prefix,name:"magda-gateway",version:"next",qualifiedRuntimeSource:reference}),`${prefix}magda-gateway:next`);
});
test("manual non-qualified retagging retains its existing interface", () => {
    assert.equal(getRetagSource({prefix,name:"magda-agent-runtime",version:"local"}),`${prefix}magda-agent-runtime:local`);
});
test("runtime promotion rejects foreign repositories, tags and malformed digests", () => {
    for (const source of ["evil.example/runtime@sha256:"+"a".repeat(64),`${prefix}magda-agent-runtime:next`,reference+"\n",reference.replace("a".repeat(64),"b".repeat(63))]) {
        assert.throws(()=>getRetagSource({prefix,name:"magda-agent-runtime",version:"next",qualifiedRuntimeSource:source}),/immutable SHA256/);
    }
});
