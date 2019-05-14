/**
 * Abstract Editor. Can view or edit.
 */
export default interface Editor<V> {
    edit: (
        value: V | undefined,
        onChange: (value: V | undefined) => void
    ) => JSX.Element;
    view: (value: V | undefined) => JSX.Element;
}
