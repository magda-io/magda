/**
 * Lightweight stand-ins for rsuite components in jsdom tests, used with
 * `jest.mock("rsuite/X", () => require("./testUtils/rsuiteMocks").X)`. They
 * keep labels, values and callbacks, and drop styling props.
 */
import React from "react";

export const Button = ({
    as: As,
    children,
    loading,
    appearance,
    color,
    size,
    startIcon,
    block,
    ...rest
}: any) =>
    As ? (
        <As {...rest}>{children}</As>
    ) : (
        <button type={rest.type || "button"} {...rest}>
            {children}
        </button>
    );

export const Input = ({ onChange, as: As, ...rest }: any) => {
    const Tag = As || "input";
    return (
        <Tag
            {...rest}
            value={rest.value ?? ""}
            onChange={(event: any) => onChange?.(event.target.value, event)}
        />
    );
};

export const InputGroup = Object.assign(
    ({ children }: any) => <div>{children}</div>,
    {
        Button: ({ onClick, children, ...rest }: any) => (
            <button
                type="button"
                aria-label={rest["aria-label"]}
                onClick={onClick}
            >
                {children}
            </button>
        )
    }
);

export const Message = ({ children, header, type, showIcon, ...rest }: any) => (
    <div role={rest.role || "status"} data-type={type}>
        {header ? <strong>{header}</strong> : null}
        {children}
    </div>
);

export const Loader = ({ content }: any) => <span>{content}</span>;

export const Panel = ({ children }: any) => <div>{children}</div>;

export const Pagination = ({ total, activePage }: any) => (
    <div data-testid="pagination">
        page {activePage} of {total}
    </div>
);

const RowContext = React.createContext<any>({});

export const Table = Object.assign(
    ({ data, children }: any) => (
        <table>
            <tbody>
                {(data || []).map((row: any) => (
                    <RowContext.Provider key={row.id} value={row}>
                        <tr>{children}</tr>
                    </RowContext.Provider>
                ))}
            </tbody>
        </table>
    ),
    {
        Column: ({ children }: any) => <>{children}</>,
        HeaderCell: () => null,
        Cell: ({ children, dataKey }: any) => {
            const row = React.useContext(RowContext);
            return (
                <td>
                    {typeof children === "function"
                        ? children(row)
                        : row[dataKey]}
                </td>
            );
        }
    }
);

const NavContext = React.createContext<any>({});

export const Nav = Object.assign(
    ({ children, activeKey, onSelect }: any) => (
        <NavContext.Provider value={{ activeKey, onSelect }}>
            <nav>{children}</nav>
        </NavContext.Provider>
    ),
    {
        Item: ({ children, eventKey }: any) => {
            const { activeKey, onSelect } = React.useContext(NavContext);
            return (
                <button
                    type="button"
                    aria-current={activeKey === eventKey ? "page" : undefined}
                    onClick={() => onSelect?.(eventKey)}
                >
                    {children}
                </button>
            );
        }
    }
);

export const Modal = Object.assign(
    ({ open, children, ...rest }: any) =>
        open ? (
            <div role="dialog" aria-labelledby={rest["aria-labelledby"]}>
                {children}
            </div>
        ) : null,
    {
        Header: ({ children }: any) => <div>{children}</div>,
        Title: ({ children, id }: any) => <h4 id={id}>{children}</h4>,
        Body: ({ children }: any) => <div>{children}</div>,
        Footer: ({ children }: any) => <div>{children}</div>
    }
);

const RadioContext = React.createContext<any>({});

export const RadioGroup = ({ children, value, onChange, name }: any) => (
    <RadioContext.Provider value={{ value, onChange, name }}>
        <div role="radiogroup">{children}</div>
    </RadioContext.Provider>
);

/** In a `RadioGroup`, or standalone with `checked` and `onChange`. */
export const Radio = ({
    children,
    value,
    disabled,
    checked,
    onChange,
    name,
    ...rest
}: any) => {
    const group = React.useContext(RadioContext);
    const inGroup = group.onChange !== undefined;
    return (
        <label>
            <input
                type="radio"
                name={inGroup ? group.name : name}
                value={value}
                disabled={disabled}
                aria-label={rest["aria-label"]}
                checked={inGroup ? group.value === value : !!checked}
                onChange={() =>
                    inGroup ? group.onChange(value) : onChange?.(value)
                }
            />
            {children}
        </label>
    );
};

export const Toggle = ({ checked, onChange, label, disabled }: any) => (
    <label>
        <input
            type="checkbox"
            role="switch"
            checked={!!checked}
            disabled={disabled}
            onChange={(event) => onChange?.(event.target.checked)}
        />
        {label}
    </label>
);

/** A `<select multiple>` with the picker's options. */
export const TagPicker = ({ id, data, value, onChange, disabled }: any) => (
    <select
        id={id}
        multiple
        disabled={disabled}
        value={value || []}
        onChange={(event) =>
            onChange?.(
                Array.from(event.target.selectedOptions).map(
                    (option) => option.value
                )
            )
        }
    >
        {(data || []).map((item: any) => (
            <option key={item.value} value={item.value}>
                {item.label}
            </option>
        ))}
    </select>
);

export const SelectPicker = ({ id, data, value, onChange, disabled }: any) => (
    <select
        id={id}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
    >
        {(data || []).map((item: any) => (
            <option key={item.value} value={item.value}>
                {item.label}
            </option>
        ))}
    </select>
);
