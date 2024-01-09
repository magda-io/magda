import React, { FunctionComponent } from "react";
import { ParsedDataset } from "helpers/record";
import { useAsync } from "react-async-hook";
import { fetchRecord } from "api-clients/RegistryApis";
import CommonLink from "Components/Common/CommonLink";
import "./CurrencyAlert.scss";

type PropsType = {
    dataset: ParsedDataset;
};

const CurrencyAlert: FunctionComponent<PropsType> = (props) => {
    const status = props.dataset?.currency?.status;
    const retireReason = props.dataset?.currency?.retireReason;
    const supersededBy = props.dataset?.currency?.supersededBy;

    const { result, loading, error } = useAsync(
        async (status, supersededBy): Promise<any[]> => {
            if (status !== "SUPERSEDED" || !supersededBy?.length) {
                return [];
            } else {
                return await Promise.all(
                    supersededBy
                        .filter((item) => item?.id?.length || item?.name)
                        .map(async (item) => {
                            if (item?.id?.length) {
                                try {
                                    const record = await fetchRecord(
                                        item.id[0],
                                        ["dcat-dataset-strings"],
                                        [],
                                        false
                                    );
                                    const name = record?.aspects?.[
                                        "dcat-dataset-strings"
                                    ]?.title
                                        ? record.aspects["dcat-dataset-strings"]
                                              .title
                                        : record.name;
                                    return {
                                        name,
                                        id: item.id[0]
                                    };
                                } catch (e) {
                                    console.error(
                                        "Failed to fetch dataset name: ",
                                        e
                                    );
                                    return {
                                        id: item.id[0]
                                    };
                                }
                            } else {
                                return {
                                    name: item.name
                                };
                            }
                        })
                );
            }
        },
        [status, supersededBy]
    );

    if (status === "CURRENT") {
        return null;
    } else if (status === "RETIRED") {
        return (
            <div className="currency-alert au-page-alerts au-page-alerts--warning">
                <h3>Retired Dataset</h3>
                <p>This dataset is retired.</p>
                {retireReason ? <p>Retired Reason: {retireReason}</p> : null}
            </div>
        );
    } else if (status === "SUPERSEDED") {
        return (
            <div className="currency-alert au-page-alerts au-page-alerts--warning">
                <h3>Superseded Dataset</h3>
                <p>
                    <div>This dataset has been superseded by:</div>
                    {loading || !result ? (
                        <div>Loading...</div>
                    ) : error ? (
                        <div>Error: {`${error}`}...</div>
                    ) : (
                        <ul>
                            {result.map((item, idx) => (
                                <li key={idx}>
                                    {item?.id ? (
                                        <CommonLink
                                            href={`/dataset/${item.id}/details`}
                                        >
                                            {item?.name ? item.name : item.id}
                                        </CommonLink>
                                    ) : (
                                        <>{item.name}</>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </p>
            </div>
        );
    } else {
        return null;
    }
};

export default CurrencyAlert;
