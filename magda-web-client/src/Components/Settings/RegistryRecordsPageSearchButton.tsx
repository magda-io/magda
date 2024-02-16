import React, { FunctionComponent, useRef, useState, useCallback } from "react";
import Whisper, { WhisperInstance } from "rsuite/Whisper";
import IconButton from "rsuite/IconButton";
import Popover from "rsuite/Popover";
import InputGroup from "rsuite/InputGroup";
import Input from "rsuite/Input";
import { BsSearch, BsXCircle } from "react-icons/bs";

type PropsType = {
    executeSearch: (query: string) => void;
};

const RegistryRecordsPageSearchButton: FunctionComponent<PropsType> = ({
    executeSearch
}) => {
    const whisperRef = useRef<WhisperInstance>(null);
    const [query, setQuery] = useState<string>("");

    const inputOnkeyDown = useCallback(
        (e) => {
            if (e.keyCode === 13) {
                executeSearch(query.trim());
                whisperRef.current?.close();
            }
        },
        [whisperRef, executeSearch, query]
    );

    const buttonClick = useCallback(() => {
        setQuery("");
        executeSearch("");
    }, [setQuery, executeSearch]);

    const buttonPopover = (
        <Popover className="registry-records-search-popover">
            <InputGroup inside>
                <Input
                    placeholder="Please input keywords and press enter to search records..."
                    value={query}
                    onChange={setQuery}
                    onKeyDown={inputOnkeyDown}
                />
                {query?.trim()?.length ? (
                    <InputGroup.Button onClick={buttonClick}>
                        <BsXCircle />
                    </InputGroup.Button>
                ) : (
                    <InputGroup.Addon>
                        <BsSearch />
                    </InputGroup.Addon>
                )}
            </InputGroup>
        </Popover>
    );

    return (
        <Whisper
            placement="bottomStart"
            controlId="registry-records-search-popover"
            trigger="click"
            ref={whisperRef}
            speaker={buttonPopover}
        >
            <IconButton
                className="rs-btn-icon-fix"
                appearance="primary"
                icon={<BsSearch />}
            >
                Search Records
            </IconButton>
        </Whisper>
    );
};

export default RegistryRecordsPageSearchButton;
