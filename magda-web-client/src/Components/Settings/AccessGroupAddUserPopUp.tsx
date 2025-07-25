import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useCallback,
    useImperativeHandle,
    useRef,
    useState
} from "react";
import reportError from "helpers/reportError";
import { useAsync, useAsyncCallback } from "react-async-hook";
import Button from "rsuite/Button";
import Loader from "rsuite/Loader";
import Modal from "rsuite/Modal";
import { getUserById, addUserToAccessGroup } from "api-clients/AuthApis";
import AccessGroupSelectionDataGrid from "./AccessGroupSelectionDataGrid";
import "./AccessGroupAddUserPopUp.scss";
import reportInfo from "./reportInfo";

type PropsType = {};

type SubmitCompleteHandlerType = (userId: string, groupId: string) => void;

export type RefType = {
    open: (userId: string, onComplete?: SubmitCompleteHandlerType) => void;
    close: () => void;
};

const AccessGroupAddUserPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    peops,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [userId, setUserId] = useState<string>();
    const [userName, setUserName] = useState<string>("");
    const userNameStr = userName ? `"${userName}" ` : "";
    const onCompleteRef = useRef<SubmitCompleteHandlerType>();

    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const onModalClose = useCallback(() => {
        setIsOpen(false);
    }, []);

    useImperativeHandle(ref, () => ({
        open: (id: string, onComplete?: SubmitCompleteHandlerType) => {
            onCompleteRef.current = onComplete;
            id = id?.trim();
            setUserId(id);
            setDataReloadToken(`${Math.random()}`);
            setIsOpen(true);
        },
        close: () => onModalClose
    }));

    useAsync(
        async (dataReloadToken?: string) => {
            try {
                if (!userId) {
                    setUserName("");
                } else {
                    const user = await getUserById(userId, true);
                    setUserName(user?.displayName ? user.displayName : "");
                }
            } catch (e) {
                reportError(`Failed to load user data: ${e}`);
            }
        },
        [dataReloadToken]
    );

    const submitData = useAsyncCallback(
        async (groupId: string, groupName: string) => {
            try {
                if (!userId) {
                    throw new Error("user id cannot be empty!");
                }
                await addUserToAccessGroup(userId, groupId);
                reportInfo(
                    `User ${userNameStr}has been added to access group "${groupName}" successfully!`,
                    { type: "success" }
                );
                setIsOpen(false);
            } catch (e) {
                reportError(
                    `Failed to add user ${userNameStr}to access group "${groupName}": ${e}`
                );
                throw e;
            }
        }
    );

    return (
        <Modal
            className="access-group-add-user-popup"
            backdrop={"static"}
            keyboard={false}
            open={isOpen}
            size="lg"
            overflow={true}
            onClose={onModalClose}
        >
            <Modal.Header>
                <Modal.Title>Add user {userNameStr}to access group</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <>
                    {submitData.loading ? (
                        <Loader
                            backdrop
                            content={`Adding user ${userNameStr}to access group...`}
                            vertical
                        />
                    ) : null}
                    <AccessGroupSelectionDataGrid
                        onGroupSeleted={submitData.execute}
                    />
                </>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={onModalClose} disabled={submitData.loading}>
                    Close
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(AccessGroupAddUserPopUp);
