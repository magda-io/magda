import React, { FunctionComponent } from "react";
import { useLocation } from "react-router-dom";
import urijs from "urijs";
import { useAsync } from "react-async-hook";
import neo4j, { Driver, Transaction, Session, Node } from "neo4j-driver";
import { openSession } from "../../../api-clients/neo4jApis";
import uniqBy from "lodash/uniqBy";
import "./SearchResultRecommandation.scss";
import CommonLink from "Components/Common/CommonLink";
import TooltipWrapper from "Components/Common/TooltipWrapper";
import ucwords from "ucwords";
import helpIcon from "assets/help.svg";

const useSearchInput = () => {
    const location = useLocation();
    const { search: queryString } = location;
    if (!queryString) {
        return "";
    }
    const uri = urijs(queryString);
    const searchInput = uri.search(true)?.q as string;
    return searchInput ? searchInput : "";
};

const neo4jServerUrl = "bolt://icp-bolt.dev.magda.io:443";
const neo4jUsername = "neo4j";
const neo4jPassword = "icp2020";
const MAX_DATASET_NUM = 10;

// (window as any).neo4jDB = neo4j.driver(
//     neo4jServerUrl,
//     neo4j.auth.basic(neo4jUsername, neo4jPassword)
// );

const fullTextIndexName = "magdaEnityFullText";

let fullTextIndexExist: boolean | null = null;

async function isIndexExist(txc: Transaction, name: string) {
    if (fullTextIndexExist) {
        return true;
    }
    const result = await txc.run(`CALL db.indexes`);
    if (!result?.records?.length) {
        return false;
    }
    if (result.records.findIndex((item) => item.get("name") === name) === -1) {
        return false;
    }
    fullTextIndexExist = true;
    return true;
}

async function creationFullTextIndex(driver: Driver) {
    const session = driver.session({ defaultAccessMode: "WRITE" });
    const txc = session.beginTransaction();
    try {
        if (await isIndexExist(txc, fullTextIndexName)) {
            return;
        } else {
            await txc.run(
                `CALL db.index.fulltext.createNodeIndex($indexName,["Entity"],["name", "description"])`,
                {
                    indexName: fullTextIndexName
                }
            );
            await txc.commit();
        }
    } catch (e) {
        throw e;
    } finally {
        await session.close();
    }
}

async function queryEnities(
    session: Session,
    searchText: string
): Promise<EntityList> {
    const result = await session.run(
        `CALL db.index.fulltext.queryNodes($indexName, $searchText) YIELD node, score 
        RETURN node, score`,
        {
            indexName: fullTextIndexName,
            searchText
        }
    );
    return result.records.map((item) => ({
        node: item.get("node"),
        score: item.get("score")
    }));
}

type EntityList = {
    node: Node;
    score: number;
}[];

type RecommendedDatasetItem = {
    datasetId: string;
    datasetTitle: string;
    rel: string;
    entity: string;
    score: number;
};

type ConsolidatedRecommendedDatasetItem = {
    id: string;
    title: string;
    reasons: {
        rel: string;
        entity: string;
    }[];
};

async function searchRecommandationWithEnities(
    session: Session,
    entities: EntityList
) {
    let rows: RecommendedDatasetItem[] = [];
    for (let i = 0; i < entities.length; i++) {
        const result = await session.run(
            `
            MATCH (e:Entity)-[r]-(e1:Entity)<--(d:Dataset)
            WHERE id(e)=$entityId 
            RETURN type(r) as rel, id(d) as datasetId, d.name as datasetTitle`,
            {
                entityId: entities[i].node.identity
            }
        );
        result.records.forEach((item) =>
            rows.push({
                datasetId: item.get("datasetId"),
                datasetTitle: item.get("datasetTitle"),
                rel: item.get("rel"),
                entity: entities[i].node.properties.name as string,
                score: entities[i].score
            })
        );
    }
    console.log("before nerge: ", rows);

    rows.sort((a, b) => b.score - a.score);

    rows = uniqBy(
        rows,
        (item) => item.datasetId + "|" + item.rel + "|" + item.entity
    );

    if (rows.length > MAX_DATASET_NUM) {
        rows = rows.slice(0, MAX_DATASET_NUM);
    }

    return rows;
}

const queryRecommandation = async (text: string) => {
    const driver: Driver = neo4j.driver(
        neo4jServerUrl,
        neo4j.auth.basic(neo4jUsername, neo4jPassword)
    );
    try {
        await creationFullTextIndex(driver);
        const session = await openSession(driver, {
            defaultAccessMode: "READ"
        });
        const entities = await queryEnities(session, text);
        console.log("entities: ", entities);

        const rows = await searchRecommandationWithEnities(session, entities);

        console.log("rows: ", rows);

        const recommendedDatasetList: {
            [datasetId: string]: ConsolidatedRecommendedDatasetItem;
        } = {};

        rows.forEach((item) => {
            if (!recommendedDatasetList[item.datasetId]) {
                recommendedDatasetList[item.datasetId] = {
                    id: item.datasetId,
                    title: item.datasetTitle,
                    reasons: []
                };
            }
            recommendedDatasetList[item.datasetId].reasons.push({
                rel: item.rel,
                entity: item.entity
            });
        });

        return Object.values(recommendedDatasetList);
    } finally {
        if (driver) {
            await driver.close();
        }
    }
};

const queryCache: {
    [key: string]: Promise<any>;
} = {};

async function getRecommandation(
    text: string
): Promise<ConsolidatedRecommendedDatasetItem[]> {
    const result = queryCache[text];
    if (result) {
        return await result;
    } else {
        queryCache[text] = queryRecommandation(text);
        return await queryCache[text];
    }
}

function renderResult(
    result: ConsolidatedRecommendedDatasetItem[] | undefined,
    searchText: string
) {
    if (!result?.length) {
        return <div>No recommendation can be made at this time.</div>;
    }

    return (
        <ul className="recommend-dataset-list">
            {result.map((item, idx) => {
                return (
                    <li key={idx}>
                        <span className="tooltip-container">
                            <TooltipWrapper
                                className="tooltip tooltip-why-recommend-dataset"
                                launcher={() => (
                                    <div className="tooltip-launcher-icon help-icon">
                                        <img
                                            src={helpIcon}
                                            alt="Why recommend this dataset?"
                                        />
                                    </div>
                                )}
                                innerElementClassName="inner"
                            >
                                {() => {
                                    return (
                                        <div>
                                            <div className="heading">
                                                Why Recommend this Dataset?
                                            </div>
                                            <div>
                                                <div>This dataset might:</div>
                                                <ul>
                                                    {item.reasons.map(
                                                        (item, idx) => (
                                                            <li key={idx}>
                                                                "
                                                                {ucwords(
                                                                    item.rel
                                                                        .replace(
                                                                            "_",
                                                                            " "
                                                                        )
                                                                        .toLowerCase()
                                                                )}
                                                                " "{item.entity}
                                                                "
                                                            </li>
                                                        )
                                                    )}
                                                </ul>
                                            </div>
                                        </div>
                                    );
                                }}
                            </TooltipWrapper>
                        </span>
                        <CommonLink
                            to={urijs("/")
                                .segmentCoded(["datasets", item.id, "details"])
                                .search({ q: searchText })
                                .toString()}
                        >
                            {item.title}
                        </CommonLink>
                    </li>
                );
            })}
        </ul>
    );
}

const SearchResultRecommandation: FunctionComponent = () => {
    const searchText = useSearchInput();

    const { result, loading, error } = useAsync(getRecommandation, [
        searchText
    ]);

    return (
        <div className="dataset-search-result-recommandation-box">
            <div className="dataset-search-result-recommandation-box-header">
                Dataset Suggestions:
            </div>
            {loading ? (
                <p>loading...</p>
            ) : error ? (
                <p>{"Error:" + error}</p>
            ) : (
                <div className="dataset-search-result-recommandation-box-body">
                    {renderResult(result, searchText)}
                </div>
            )}
        </div>
    );
};

/**
 *
 * match (e:Entity)-[r1]-(e1:Entity)<--(d:Dataset)  WHERE id(e)=713 return e,type(r1),e1,d
 */

export default SearchResultRecommandation;
