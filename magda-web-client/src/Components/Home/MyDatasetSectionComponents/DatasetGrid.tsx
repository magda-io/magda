import React, { FunctionComponent } from "react";
import { Link } from "react-router-dom";
import editIcon from "assets/edit.svg";
import "./DatasetGrid.scss";
import { useAsync } from "react-async-hook";

export type DatasetTypes = "drafts" | "published";

type PropsType = {
    searchText: string;
    datasetType: DatasetTypes;
};

const DatasetGrid: FunctionComponent<PropsType> = props => {
    const { result: records, loading, error } = useAsync(
        async (datasetType, searchText) => {},
        [props.datasetType, props.searchText]
    );

    console.log(records, loading, error);

    return (
        <>
            <table>
                <thead>
                    <tr>
                        <th>Dataset title</th>
                        <th className="date-col">Update Date</th>
                        <th className="edit-button-col">&nbsp;</th>
                    </tr>
                </thead>

                <tbody>
                    {Array(10)
                        .fill(0)
                        .map(item => {
                            return (
                                <tr>
                                    <td>
                                        sadjhsjhgdhsjf jshdgf jsdhf jhsdgf dsjsd
                                    </td>
                                    <td className="date-col">25/02/2020</td>
                                    <td className="edit-button-col">
                                        <Link
                                            className="edit-button"
                                            to={"/datasets"}
                                        >
                                            <img src={editIcon} />
                                        </Link>
                                    </td>
                                </tr>
                            );
                        })}
                </tbody>
            </table>
            <hr className="grid-bottom-divider" />
            <div className="paging-area">
                <button className="next-page-button">Next page</button>
            </div>
        </>
    );
};

export default DatasetGrid;
