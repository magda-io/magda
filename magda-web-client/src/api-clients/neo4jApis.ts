import {
    Transaction,
    Node,
    Relationship,
    Integer,
    Session,
    Driver,
    SessionMode
} from "neo4j-driver";
import urijs from "urijs";
import delay from "@magda/typescript-common/dist/delay";

type PropType = {
    [key: string]: any;
};

/**
 * Create a neo4j node and return its id
 *
 * @param {Transaction} txc  neo4j transaction instance
 * @param {PropType} [props={}] the properties of the node. Defaults to {}.
 * @param {string[]} [labels=[]] a list of node labels. Defaults to [].
 * @return {*} {Promise<number>}
 */
export async function createNode(
    txc: Transaction,
    props: PropType = {},
    labels: string[] = []
): Promise<Integer> {
    const labelStr = labels.map((item) => `:${item}`).join("");
    const result = await txc.run(
        `CREATE (n${labelStr} $props) RETURN id(n) AS id`,
        {
            props
        }
    );

    return result.records[0].get("id");
}

/**
 * Create Relationship between nodes (from n1 -> n2)
 *
 * @param {Transaction} txc
 * @param {Integer} startNodeId
 * @param {Integer} endNodeId
 * @param {string} relType
 * @param {PropType} [props={}]
 * @return {*}  {Promise<Integer>}
 */
export async function createRelationship(
    txc: Transaction,
    startNodeId: Integer,
    endNodeId: Integer,
    relType: string,
    props: PropType = {}
): Promise<Integer> {
    const result = await txc.run(
        `MATCH (a),(b) WHERE id(a) = $id1 AND id(b) = $id2
         CREATE (a)-[r${relType ? `:${relType}` : ""} $props]->(b)
         RETURN id(r) AS id`,
        {
            props,
            id1: startNodeId,
            id2: endNodeId
        }
    );
    return result.records[0].get("id");
}

/**
 * find nodes by props or labels
 *
 * @export
 * @param {Transaction} txc
 * @param {PropType} [props={}]
 * @param {string[]} [labels=[]]
 * @param {number} [limit=300] no of the record to be fetched. Default: 300
 * @return {*}  {Promise<Node[]>}
 */
export async function findNodes(
    txc: Transaction,
    props: PropType = {},
    labels: string[] = [],
    limit: number = 300
): Promise<Node[]> {
    const labelStr = labels.map((item) => `:${item}`).join("");
    const propsMatchStr = Object.keys(props)
        .map((key) => `${key}:$${key}`)
        .join(", ");

    const result = await txc.run(
        `MATCH (n${labelStr} ${
            propsMatchStr ? `{${propsMatchStr}}` : ""
        }) RETURN n ${limit > 0 ? `LIMIT ${limit}` : ""}`,
        props
    );
    return result.records.map((item) => item.get("n") as Node);
}

/**
 * get node by id
 *
 * @template T
 * @param {Transaction} txc
 * @param {Integer} id
 * @return {*}  {(Promise<Node | null>)}
 */
export async function getNodeById(
    txc: Transaction,
    id: Integer
): Promise<Node | null> {
    const result = await txc.run(`MATCH (n)  WHERE id(n)=$id RETURN n`, {
        id
    });
    if (!result?.records?.length) {
        return null;
    }
    return result.records[0].get("n");
}

/**
 * get relationship between nodes
 *
 * @param {Transaction} txc
 * @param {Integer} nodeId1
 * @param {Integer} nodeId2
 * @return {*}
 */
export async function getRelationshipBetweenNodes(
    txc: Transaction,
    nodeId1: Integer,
    nodeId2: Integer
): Promise<Relationship[]> {
    const result = await txc.run(
        `MATCH (n1)-[r]-(n2) WHERE id(n1) = $id1 AND id(n2) = $id2 RETURN r`,
        {
            id1: nodeId1,
            id2: nodeId2
        }
    );
    return result.records.map((item) => item.get("r") as Relationship);
}

export class UriNamespace {
    private namespaceUriObj: URI;
    private namespace: string;

    constructor(namespace: string) {
        if (!namespace) {
            throw new Error("Namespace cannot be empty!");
        }
        this.namespace = namespace;
        this.namespaceUriObj = urijs(namespace);
    }

    toString() {
        return this.namespace;
    }

    getUriFromId(id: string) {
        return this.namespace[this.namespace.length - 1] === "#"
            ? this.namespaceUriObj.clone().fragment(id).toString()
            : this.namespaceUriObj.clone().segmentCoded(id).toString();
    }

    getIdFromUri(uri: string) {
        const uriObj = urijs(uri);
        const fragment = uriObj.fragment();
        if (fragment) {
            return fragment;
        } else {
            return uriObj.segmentCoded(-1);
        }
    }
}

export const namespaceList = {
    magdaItem: new UriNamespace("https://magda.io/ns/registry-record/"),
    magdaRel: new UriNamespace("https://magda.io/ns/kg-rel/"),
    wd: new UriNamespace("http://www.wikidata.org/entity/"),
    wdt: new UriNamespace("http://www.wikidata.org/prop/direct/")
};

const MAX_CONNECTION_NUMBER = 30;
let currentConnectionNumber = 0;

export async function openSession(
    driver: Driver,
    config?: {
        defaultAccessMode?: SessionMode;
        bookmarks?: string | string[];
        fetchSize?: number;
        database?: string;
    }
): Promise<Session> {
    while (currentConnectionNumber >= MAX_CONNECTION_NUMBER) {
        await delay(1000);
    }
    try {
        currentConnectionNumber++;
        const session = await driver.session(config);
        return session;
    } catch (e) {
        currentConnectionNumber--;
        throw e;
    }
}

export async function closeSession(session: Session) {
    if (!session) {
        console.warn(`Attempt to close empty session variable.`);
        return;
    }
    await session.close();
    currentConnectionNumber--;
}

export const createRelTypeFromString = (label: string) => {
    const relTypeStr = label.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
    if (!relTypeStr) {
        return "UNNAMED_REL_TYPE";
    }
    if (/^[\d]+/.test(relTypeStr)) {
        return "R" + relTypeStr;
    }
    return relTypeStr;
};

export async function deleteNode(
    txc: Transaction,
    nodeId: Integer,
    detachNode: boolean = true
) {
    await txc.run(
        `MATCH (n) where ID(n)=$id ${
            detachNode ? "DETACH DELETE n" : "DELETE n"
        }`,
        {
            id: nodeId
        }
    );
}
