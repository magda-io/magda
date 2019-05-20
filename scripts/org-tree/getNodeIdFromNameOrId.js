const isUuid = require("./is-uuid");
async function getNodeIdByNameOrId(nameOrId, queryer) {
    if (isUuid(nameOrId)) {
        return nameOrId;
    } else {
        const nodes = await queryer.getNodesByName(nameOrId, ["id"]);
        if (!nodes || !nodes.length) {
            throw new Error(`Cannot locate node record with name: ${nameOrId}`);
        }
        return nodes[0].id;
    }
}
module.exports = getNodeIdByNameOrId;
