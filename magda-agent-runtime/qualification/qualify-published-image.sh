#!/bin/sh
# Bind both architecture evidence bundles to the just-published immutable index.
# Requires Python 3, Node 22 and Docker/buildx; caller owns registry login/binfmt.
set -eu
if [ "$#" -ne 4 ]; then
    echo "usage: $0 <untagged-image-repository> <tag> <magda-revision> <output-root>" >&2
    exit 64
fi
REPOSITORY=$1
TAG=$2
REVISION=$3
OUTPUT=$4
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$HERE/../.." && pwd)
command -v python3 >/dev/null
command -v node >/dev/null
mkdir -p "$OUTPUT"
docker buildx imagetools inspect "$REPOSITORY:$TAG" --format '{{json .Manifest}}' > "$OUTPUT/index-descriptor.json"
INDEX=$(python3 - "$OUTPUT/index-descriptor.json" <<'PY'
import json,re,sys
value=json.load(open(sys.argv[1]))["digest"]
if not re.fullmatch(r"sha256:[0-9a-f]{64}",value): raise SystemExit("invalid runtime index digest")
print(value)
PY
)
docker buildx imagetools inspect "$REPOSITORY@$INDEX" --raw > "$OUTPUT/index.json"
python3 - "$OUTPUT/index.json" "$OUTPUT/platform-digests.tsv" <<'PY'
import json,re,sys
index=json.load(open(sys.argv[1]))
selected=[]
for arch in ("amd64","arm64"):
    matches=[item for item in index.get("manifests",[]) if item.get("platform",{}).get("os")=="linux" and item.get("platform",{}).get("architecture")==arch]
    if len(matches)!=1: raise SystemExit("runtime index requires exactly one linux/"+arch+" descriptor")
    digest=matches[0].get("digest","")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}",digest): raise SystemExit("invalid platform digest")
    selected.append((arch,digest))
with open(sys.argv[2],"w") as out:
    for arch,digest in selected: out.write(arch+"\t"+digest+"\n")
PY
printf '%s@%s\n' "$REPOSITORY" "$INDEX" > "$OUTPUT/image-reference.txt"
TAB=$(printf '\t')
while IFS="$TAB" read -r ARCH DIGEST; do
    DESTINATION="$OUTPUT/linux-$ARCH"
    # This also fails clearly if daemon-side cross-architecture execution is not
    # available; BuildKit's emulators alone do not imply docker-run support.
    docker run --rm --network none --platform "linux/$ARCH" --entrypoint python3 "$REPOSITORY@$DIGEST" -c 'import platform; print("collector execution:", platform.machine())'
    sh "$HERE/generate-image-artifacts.sh" \
        --image "$REPOSITORY@$DIGEST" --platform "linux/$ARCH" \
        --output "$DESTINATION" --magda-revision "$REVISION"
    # MAGDA's Apache license is distinct from the transitive/native license bundle.
    mkdir -p "$DESTINATION/licenses"
    cp "$ROOT/LICENSE" "$DESTINATION/licenses/MAGDA-Apache-2.0.txt"
    node "$HERE/verify-source-references.mjs" --evidence-dir "$DESTINATION" \
        --output "$DESTINATION/source-reference-review.json"
    cp "$HERE/README.md" "$DESTINATION/QUALIFICATION.md"
    cp "$HERE/source-references.json" "$DESTINATION/source-references.json"
done < "$OUTPUT/platform-digests.tsv"
python3 - "$OUTPUT" <<'PY'
import hashlib,json,pathlib,sys
root=pathlib.Path(sys.argv[1]).resolve()
def records(directory,excluded):
    result=[]
    for file in sorted(directory.rglob("*")):
        if file.is_symlink(): raise SystemExit("unexpected symlink in qualification artifacts")
        name=file.relative_to(directory).as_posix()
        if not file.is_file() or name in excluded: continue
        digest=hashlib.sha256()
        with file.open("rb") as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b""): digest.update(chunk)
        result.append({"sha256":digest.hexdigest(),"path":name})
    return result
for directory in (root/"linux-amd64",root/"linux-arm64"):
    manifest=directory/"artifact-manifest.json"
    data=json.loads(manifest.read_text())
    data["files"]=records(directory,{"artifact-manifest.json","SHA256SUMS"})
    data["note"]="Final digest-bound bundle including collector, source-reference review and MAGDA license; not legal approval. This index excludes itself and SHA256SUMS."
    manifest.write_text(json.dumps(data,indent=2,sort_keys=True)+"\n")
    (directory/"SHA256SUMS").write_text("".join(row["sha256"]+"  "+row["path"]+"\n" for row in records(directory,{"SHA256SUMS"})))
(root/"SHA256SUMS").write_text("".join(row["sha256"]+"  "+row["path"]+"\n" for row in records(root,{"SHA256SUMS"})))
PY
printf 'Evidence complete for %s@%s; source/license findings remain review items, not legal approval.\n' "$REPOSITORY" "$INDEX"
