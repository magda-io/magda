/**
 * Abstract Editor. Can view or edit.
 */
export default interface Editor<V> {
    edit: (
        value: V | undefined,
        onChange: (value: V | undefined) => void,
        multiValues?: any,
        extraProps?: any
    ) => JSX.Element;
    view: (value: V | undefined) => JSX.Element;
}
