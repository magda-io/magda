import React, {
    FunctionComponent,
    ButtonHTMLAttributes,
    useState,
    MouseEvent,
    useEffect
} from "react";

type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;
type PropsType = Overwrite<
    ButtonHTMLAttributes<HTMLButtonElement>,
    {
        onClick: (e: MouseEvent<HTMLButtonElement>) => Promise<any>;
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

    return <button {...newProps} />;
};

export default AsyncButton;
