import React, { FunctionComponent, useState } from "react";
import { useAsync } from "react-async-hook";
import Pagination from "rsuite/Pagination";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";
import { Input, InputGroup } from "rsuite";
import { MdSearch } from "react-icons/md";
import PanelGroup from "rsuite/PanelGroup";
import Loader from "rsuite/Loader";
import Placeholder from "rsuite/Placeholder";
import {
    queryRecordAspects,
    queryRecordAspectsCount
} from "../../api-clients/RegistryApis";
import "./RegistryRecordAspectsPanel.scss";
import RegistryRecordAspectItem from "./RegistryRecordAspectItem";

const Paragraph = Placeholder.Paragraph;

type PropsType = {
    recordId: string;
};

const DEFAULT_MAX_PAGE_RECORD_NUMBER = 10;

const RegistryRecordAspectsPanel: FunctionComponent<PropsType> = (props) => {
    const { recordId } = props;
    const [keyword, setKeyword] = useState<string>("");
    const [page, setPage] = useState<number>(0);

    const [limit, setLimit] = useState(DEFAULT_MAX_PAGE_RECORD_NUMBER);
    const offset = page * limit;

    const [searchInputText, setSearchInputText] = useState<string>("");

    const { result, loading: isLoading } = useAsync(
        async (
            recordId: string,
            keyword: string,
            offset: number,
            limit: number
        ) => {
            try {
                const aspectIds = await queryRecordAspects<string[]>({
                    recordId,
                    keyword: keyword.trim() ? keyword : undefined,
                    aspectIdOnly: true,
                    noCache: true,
                    offset,
                    limit
                });

                const count = await queryRecordAspectsCount({
                    recordId,
                    noCache: true,
                    keyword: keyword.trim() ? keyword : undefined
                });

                return [aspectIds, count] as [string[], number];
            } catch (e) {
                toaster.push(
                    <Notification
                        type={"error"}
                        closable={true}
                        header="Error"
                    >{`Failed to load record aspects data: ${e}`}</Notification>,
                    {
                        placement: "topEnd"
                    }
                );
                throw e;
            }
        },
        [recordId, keyword, offset, limit]
    );

    const [aspectIds, totalCount] = result ? result : [[], 0];

    console.log(aspectIds);

    return (
        <>
            {isLoading ? (
                <Paragraph rows={8}>
                    <Loader center content="loading" />
                </Paragraph>
            ) : (
                <div className="record-aspects-list">
                    <div className="search-button-container">
                        <div className="search-button-inner-wrapper">
                            <InputGroup size="md" inside>
                                <Input
                                    placeholder="Enter a keyword to search..."
                                    value={searchInputText}
                                    onChange={setSearchInputText}
                                    onKeyDown={(e) => {
                                        if (e.keyCode === 13) {
                                            setKeyword(searchInputText);
                                        }
                                    }}
                                />
                                <InputGroup.Button
                                    onClick={() => setKeyword(searchInputText)}
                                >
                                    <MdSearch />
                                </InputGroup.Button>
                            </InputGroup>
                        </div>
                    </div>

                    <div>
                        <PanelGroup accordion bordered>
                            {aspectIds.map((aspectId) => (
                                <RegistryRecordAspectItem
                                    recordId={recordId}
                                    aspectId={aspectId}
                                />
                            ))}
                        </PanelGroup>
                        <div className="pagination-container">
                            <Pagination
                                prev
                                next
                                first
                                last
                                ellipsis
                                boundaryLinks
                                maxButtons={5}
                                size="xs"
                                layout={[
                                    "total",
                                    "-",
                                    "limit",
                                    "|",
                                    "pager",
                                    "skip"
                                ]}
                                total={totalCount}
                                limitOptions={[
                                    DEFAULT_MAX_PAGE_RECORD_NUMBER,
                                    20
                                ]}
                                limit={limit}
                                activePage={page}
                                onChangePage={setPage}
                                onChangeLimit={setLimit}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default RegistryRecordAspectsPanel;
