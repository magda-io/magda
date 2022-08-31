import React, { FunctionComponent } from "react";
import Panel from "rsuite/Panel";
import { Record } from "api-clients/RegistryApis";
import "./RegistryRecordInfoPanel.scss";

type PropsType = {
    record: Record;
};

const RegistryRecordInfoPanel: FunctionComponent<PropsType> = (props) => {
    const { record } = props;
    return (
        <Panel className="registry-record-info-panel" bordered>
            <table>
                <tbody>
                    <tr>
                        <td>Record ID:</td>
                        <td colSpan={3}>{record.id}</td>
                    </tr>
                    <tr>
                        <td>Record Name:</td>
                        <td colSpan={3}>{record.name}</td>
                    </tr>
                </tbody>
            </table>
        </Panel>
    );
};

export default RegistryRecordInfoPanel;
