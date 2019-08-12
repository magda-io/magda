const isUuid = require("@magda/typescript-common/dist/util/isUuid").default;
async function getNodeIdByNameOrId(nameOrId, queryer) {
    if (isUuid(nameOrId)) {
        return nameOrId;
    } else {
        const nodes = await queryer.getNodes({ name: nameOrId }, ["id"]);
        if (!nodes || !nodes.length) {
            throw new Error(`Cannot locate node record with name: ${nameOrId}`);
        }
        return nodes[0].id;
    }
}
module.exports = getNodeIdByNameOrId;
