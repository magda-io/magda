import React from "react";

import "./FileIcon.scss";

export default function FileIcon(props) {
    const fontSize = props.text.length > 3 ? 14 : 17;
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            xlinkHref="http://www.w3.org/1999/xlink"
            viewBox="0 0 54 79"
            className="file-icon-svg"
            {...props}
        >
            <defs>
                <path
                    id="a"
                    d="M2.56 56.602h42.88V17.257h-6.08a8 8 0 0 1-8-8V2.76H6.4c-2.12 0-3.84 1.854-3.84 4.142v49.699zM6.4 0h26.389L48 16.022v55.075C48 74.91 45.135 78 41.6 78H6.4C2.865 78 0 74.91 0 71.097V6.903C0 3.09 2.865 0 6.4 0z"
                />
            </defs>
            <g fill="none" fill-rule="evenodd">
                <g transform="translate(3)">
                    <mask id="b" fill="#fff">
                        <use xlinkHref="#a" />
                    </mask>
                    <use fill="#4B2A85" fill-rule="nonzero" xlinkHref="#a" />
                    <g fill="#320D3B" mask="url(#b)">
                        <path d="M-2-2h53v82H-2z" />
                    </g>
                </g>
                <text
                    fill="#FFF"
                    font-family='-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"'
                    font-size={fontSize}
                    font-weight="400"
                >
                    <tspan x="10.419" y="72.664">
                        {" "}
                        {props.text || "SVG"}
                    </tspan>
                </text>
            </g>
        </svg>
    );
}
