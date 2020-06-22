import React, { FunctionComponent } from "react";

import "./SupercedeSelectionBox.scss";
import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";

import DatasetFile from "Components/Dataset/Add/DatasetFile";

type PropsType = {
    existingDistributions: Distribution[];
    newDistributions: Distribution[];
    deleteDistributionHandler: (dist: string) => () => Promise<void>;
    editDistributionHandler: (
        distId: string
    ) => (updater: (distribution: Distribution) => Distribution) => void;
};

const SupercedeSelectionBox: FunctionComponent<PropsType> = (props) => {
    const { existingDistributions } = props;

    return (
        <div className="distribution-supercede-selection-box">
            <table>
                <thead>
                    <tr>
                        <th>Existing content</th>
                        <th>Replacement content</th>
                    </tr>
                </thead>
                <tbody>
                    {existingDistributions.map((item) => (
                        <tr>
                            <td>
                                <DatasetFile file={item} />
                            </td>
                            <td>&nbsp;</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="new-files-area">
                <div className="heading">Your new content:</div>
                <div className="new-file-items-area">
                    {existingDistributions.map((item) => (
                        <div className="cols-sm-6">
                            <DatasetFile file={item} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SupercedeSelectionBox;
