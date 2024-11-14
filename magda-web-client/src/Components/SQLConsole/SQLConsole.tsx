import React, { FunctionComponent } from "react";

import {
    Drawer,
    ButtonToolbar,
    Button,
    Input,
    Panel,
    IconButton,
    List,
    Loader,
    RadioGroup,
    Radio
} from "rsuite";

interface PropsType {}

const SQLConsole: FunctionComponent<PropsType> = (props) => {
    const makeDrawerBody = () => (
        <Drawer.Body className="magda-chat-box-message-area-body">
            <Panel bordered className="message-area">
                sdfsdssfdssf
            </Panel>
            <Input className="message-input" as="textarea" rows={3} />
            <ButtonToolbar className="send-button-tool-bar">
                <Button className="send-button" appearance="primary">
                    Send Message
                </Button>
                <Button className="clear-message-button">Clear Message</Button>
            </ButtonToolbar>
        </Drawer.Body>
    );

    return (
        <Drawer
            className="magda-chat-box-drawer"
            placement={"bottom"}
            backdrop={false}
            size={"full" as any}
        >
            <Drawer.Header>
                <Drawer.Title>SQL Console</Drawer.Title>
            </Drawer.Header>
            {makeDrawerBody()}
        </Drawer>
    );
};

export default SQLConsole;
