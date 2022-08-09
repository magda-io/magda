import React, { useState, ReactNode, FunctionComponent } from "react";
import Toggle from "rsuite/Toggle";
import { useAsync } from "react-async-hook";
import { useCallback } from "react";
import reportError from "../helpers/reportError";

type PropsType = {
    checkedChildren?: ReactNode;
    unCheckedChildren?: ReactNode;
    fetchInitialCheckedStatus: () => Promise<boolean>;
    onChange: (checked: boolean) => Promise<boolean>;
};

const AsyncToggle: FunctionComponent<PropsType> = (props) => {
    const { fetchInitialCheckedStatus, onChange } = props;
    const [checked, setChecked] = useState(false);
    const [loading, setLoading] = useState(false);

    const { loading: initialLoading } = useAsync(async () => {
        try {
            const checked = await fetchInitialCheckedStatus();
            setChecked(checked);
        } catch (e) {
            reportError(`Failed to fetch initial value: ${e}`);
        }
    }, []);

    const onChangeHandler = useCallback(
        async (checked) => {
            try {
                setLoading(true);
                const newChecked = await onChange(checked);
                setChecked(newChecked);
                setLoading(false);
            } catch (e) {
                setLoading(false);
                reportError(`Failed to update value: ${e}`);
            }
        },
        [onChange]
    );

    return (
        <Toggle
            loading={loading || initialLoading}
            checked={checked}
            onChange={onChangeHandler}
            checkedChildren={
                <>
                    {props?.checkedChildren ? props.checkedChildren : "Enabled"}
                </>
            }
            unCheckedChildren={
                <>
                    {props?.checkedChildren
                        ? props.checkedChildren
                        : "Disabled"}
                </>
            }
        />
    );
};

export default AsyncToggle;
