import React, {
    FunctionComponent,
    ButtonHTMLAttributes,
    useState,
    MouseEvent,
    useEffect
} from "react";

import "./AsyncButton.scss";

type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;
type PropsType = Overwrite<
    ButtonHTMLAttributes<HTMLButtonElement>,
    {
        // --- when handler do not return a promise, the handler will be considered as immediately resolved
        // --- We want reuse this component for other purpose / features (e.g. support button icon / built-in style)
        // --- Thus, make it more like a normal button (e.g. in term of props type supported )
        onClick?: (e: MouseEvent<HTMLButtonElement>) => Promise<any> | any;
        icon?: React.FunctionComponent<
            React.SVGProps<SVGSVGElement> & { title?: string }
        >;
        isSecondary?: boolean;
    }
>;

/**
 * A button will auto add `...` to button content until onClick is resolved
 *
 * @param props support all buttom element's attributes
 */
const AsyncButton: FunctionComponent<PropsType> = (props) => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const newProps = { ...props };
    let isUnmounted = false;

    useEffect(() => {
        isUnmounted = false;

        return () => {
            isUnmounted = true;
        };
    }, []);

    if (props.children) {
        const frag = <>{props.children}</>;
        newProps.children = (
            <>
                {frag}
                {isLoading ? "..." : null}
            </>
        );
    }

    newProps.disabled = isLoading;

    if (props.onClick && typeof props.onClick === "function") {
        newProps.onClick = async (...args) => {
            if (!isUnmounted) {
                setIsLoading(true);
            }
            // --- await `result` will be resolved to the `result`
            await props.onClick?.apply(null, args);
            if (!isUnmounted) {
                setIsLoading(false);
            }
        };
    }

    const commonClassNames = `au-btn async-button ${
        props.isSecondary ? "au-btn--secondary is-secondary" : ""
    } ${props.icon ? "with-icon" : ""}`;

    newProps.className = props.className
        ? `${commonClassNames} ${props.className}`
        : commonClassNames;

    const Icon = props.icon;

    if (Icon) {
        return (
            <button {...newProps}>
                <Icon />
                <>{newProps.children}</>
            </button>
        );
    } else {
        return <button {...newProps} />;
    }
};

export default AsyncButton;
