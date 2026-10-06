import { useCallback, useRef, useState } from "react";
import { getContent } from "api-clients/ContentApis";

type OpenOptions<V> = {
    /** form values for a new item */
    initialValue: V;
    onComplete?: (contentId: string) => void;
};

/**
 * State of a create / edit content item pop-up form.
 *
 * `open()` resets the form values synchronously (so a reopened form never shows the values
 * of a previous session) and, when editing, loads the item with no cache.
 */
export default function useContentFormState<T, V>(
    toFormValue: (content: T) => V,
    initialValue: V
) {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [contentId, setContentId] = useState<string>();
    const [formValue, setFormValue] = useState<V>(initialValue);
    const [formError, setFormError] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<Error | null>(null);
    const onCompleteRef = useRef<(contentId: string) => void>();
    // ignore the responses of outdated requests
    const requestIdRef = useRef<number>(0);
    const toFormValueRef = useRef(toFormValue);
    toFormValueRef.current = toFormValue;

    const open = useCallback(
        (id: string | undefined, options: OpenOptions<V>) => {
            const requestId = ++requestIdRef.current;
            onCompleteRef.current = options.onComplete;
            setContentId(id);
            setFormValue(options.initialValue);
            setFormError({});
            setLoadError(null);
            setIsOpen(true);
            if (!id) {
                setLoading(false);
                return;
            }
            setLoading(true);
            getContent<T>(id)
                .then((content) => {
                    if (requestId === requestIdRef.current) {
                        setFormValue(toFormValueRef.current(content));
                    }
                })
                .catch((e) => {
                    if (requestId === requestIdRef.current) {
                        setLoadError(e);
                    }
                })
                .finally(() => {
                    if (requestId === requestIdRef.current) {
                        setLoading(false);
                    }
                });
        },
        []
    );

    const close = useCallback(() => {
        requestIdRef.current++;
        setIsOpen(false);
    }, []);

    const complete = useCallback((id: string) => {
        setIsOpen(false);
        if (typeof onCompleteRef.current === "function") {
            onCompleteRef.current(id);
        }
    }, []);

    return {
        isOpen,
        isCreateForm: !contentId,
        contentId,
        formValue,
        setFormValue,
        formError,
        setFormError,
        loading,
        loadError,
        open,
        close,
        complete
    };
}
