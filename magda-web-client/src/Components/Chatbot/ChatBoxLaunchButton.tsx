import { useState, useRef, FunctionComponent } from "react";
import ButtonToolbar from "rsuite/ButtonToolbar";
import IconButton from "rsuite/IconButton";
import MagdaNamespacesConsumer from "../../Components/i18n/MagdaNamespacesConsumer";
import { BsChatRightDotsFill } from "react-icons/bs";
import { useAsync } from "react-async-hook";
import reportError from "helpers/reportError";
import Loader from "rsuite/Loader";
import type ChatBoxTypeImport from "./ChatBox";
import "./ChatBoxLaunchButton.scss";

interface PropsType {
    appName: string;
}

const ChatBoxLaunchButton: FunctionComponent<PropsType> = (props) => {
    //const appName = props?.appName ? props.appName : "";
    const { appName } = props;
    const chatBoxCompRef = useRef<typeof ChatBoxTypeImport | null>(null);
    const ChatBox = chatBoxCompRef?.current ? chatBoxCompRef.current : null;
    const [isOpen, setIsOpen] = useState<boolean>(false);

    const { loading: chatBoxLoading } = useAsync(
        async (isOpen, ChatBox) => {
            try {
                if (ChatBox || !isOpen) {
                    return;
                }
                const module = await import(
                    /* webpackChunkName: "magda-chatbot" */ "./ChatBox"
                );
                chatBoxCompRef.current = module.default;
            } catch (e) {
                reportError("Failed to load ChatBot component: " + e);
            }
        },
        [isOpen, ChatBox]
    );

    return (
        <div className="magda-chat-box-outer-container">
            <ButtonToolbar className="launch-button">
                <IconButton
                    appearance="primary"
                    icon={<BsChatRightDotsFill />}
                    onClick={() => {
                        if (!(window as any)?.chrome) {
                            reportError(
                                "Sorry, chatbot feature currently only support Google Chrome web browser."
                            );
                            return;
                        }
                        setIsOpen(true);
                    }}
                >
                    <span className="heading">Chat to {props.appName}</span>
                </IconButton>
            </ButtonToolbar>
            {ChatBox ? (
                <ChatBox
                    appName={appName}
                    isOpen={isOpen}
                    setIsOpen={setIsOpen}
                />
            ) : null}
            {!isOpen ? null : chatBoxLoading ? (
                <Loader backdrop content="loading chatbot..." vertical />
            ) : null}
        </div>
    );
};

const ChatBoxLaunchButtonWithAppName: FunctionComponent = () => (
    <MagdaNamespacesConsumer ns={["global"]}>
        {(translate) => {
            const appName = translate(["appName", ""]);
            return <ChatBoxLaunchButton appName={appName} />;
        }}
    </MagdaNamespacesConsumer>
);

export default ChatBoxLaunchButtonWithAppName;
