import React, {
    ForwardRefRenderFunction,
    useState,
    forwardRef,
    useImperativeHandle
} from "react";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import { useAsync } from "react-async-hook";
import { getOrgUnitById } from "../../api-clients/OrgUnitApis";
import { OrgUnit } from "reducers/userManagementReducer";
import UserNameLabel from "../UserNameLabel";
import "./ViewOrgUnitPopUp.scss";

const Paragraph = Placeholder.Paragraph;

type PropsType = {};

function createOrgUnitDetails(orgUnit?: OrgUnit) {
    if (!orgUnit) {
        return null;
    }
    return (
        <table className="org-unit-detail-table">
            <tbody>
                <tr>
                    <td>ID: </td>
                    <td colSpan={3}>{orgUnit.id} </td>
                </tr>
                <tr>
                    <td>Name: </td>
                    <td colSpan={3}>{orgUnit.name} </td>
                </tr>
                <tr>
                    <td>Create By: </td>
                    <td>
                        <UserNameLabel userId={orgUnit?.create_by} />
                    </td>
                    <td>Create Time: </td>
                    <td>{orgUnit.create_time}</td>
                </tr>
                <tr>
                    <td>Edit By: </td>
                    <td>
                        <UserNameLabel userId={orgUnit?.edit_by} />
                    </td>
                    <td>Edit Time: </td>
                    <td>{orgUnit.edit_time}</td>
                </tr>
                <tr>
                    <td colSpan={4}>
                        {!orgUnit?.description
                            ? "No description."
                            : orgUnit.description}
                    </td>
                </tr>
            </tbody>
        </table>
    );
}

export type RefType = {
    open: (orgUnitId: string) => void;
    close: () => void;
};

const ViewOrgUnitPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [orgUnitId, setOrgUnitId] = useState<string>();

    useImperativeHandle(ref, () => ({
        open: (orgUnitId: string) => {
            setOrgUnitId(orgUnitId);
            setIsOpen(true);
        },
        close: () => setIsOpen(false)
    }));

    const { result: orgUnit, loading, error } = useAsync(
        async (orgUnitId?: string) => {
            if (!orgUnitId) {
                return undefined;
            }
            return await getOrgUnitById(orgUnitId as string, true);
        },
        [orgUnitId]
    );

    return (
        <Modal
            className="view-org-unit-popup"
            backdrop={true}
            keyboard={false}
            open={isOpen}
            onClose={() => setIsOpen(false)}
        >
            <Modal.Header>
                <Modal.Title>Org Unit Details</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {loading ? (
                    <Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Paragraph>
                ) : error ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve org unit details: {`${error}`}
                    </Message>
                ) : (
                    createOrgUnitDetails(orgUnit)
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button appearance="primary" onClick={() => setIsOpen(false)}>
                    Ok
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(ViewOrgUnitPopUp);
