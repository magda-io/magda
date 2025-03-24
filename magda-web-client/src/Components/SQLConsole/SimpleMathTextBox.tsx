import React, { FunctionComponent, useState } from "react";
import { useAsync } from "react-async-hook";
import Panel from "rsuite/Panel";
import Loader from "rsuite/Loader";
import Toggle from "rsuite/Toggle";
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import "./SimpleMathTextBox.scss";

function wrapLatexInMath(inputText: string) {
    // Protect [asy] ... [/asy] blocks
    const asyPlaceholders: string[] = [];
    let text = inputText.replace(/\[asy\][\s\S]*?\[\/asy\]/gi, (match) => {
        asyPlaceholders.push(match);
        return `%%ASY${asyPlaceholders.length - 1}%%`;
    });

    // Protect code fences (```...```)
    const codeFencePattern = /```[\s\S]*?```/g;
    const codePlaceholders: string[] = [];
    text = text.replace(codeFencePattern, (match) => {
        codePlaceholders.push(match);
        return `%%CODE${codePlaceholders.length - 1}%%`;
    });

    // Protect inline code (single backticks)
    const inlineCodePattern = /`[^`]*`/g;
    text = text.replace(inlineCodePattern, (match) => {
        codePlaceholders.push(match);
        return `%%CODE${codePlaceholders.length - 1}%%`;
    });

    // Protect existing math segments (\(...\), \[...\], $...$, $$...$$)
    const mathPlaceholders: string[] = [];
    const existingMathPattern = /(\$\$[\s\S]*?\$\$|\$[^$]+\$|\\\([^)]*\\\)|\\\[[^\]]*\\\])/g;
    text = text.replace(existingMathPattern, (match) => {
        mathPlaceholders.push(match);
        return `%%MATH${mathPlaceholders.length - 1}%%`;
    });

    // Helper to identify code-like lines (skip math wrapping on these)
    function isCodeLine(line) {
        if (/^\s{4,}/.test(line) || /^\t/.test(line)) return true; // Indented code block
        if (/^\s*}$/.test(line) || /^\s*{\s*$/.test(line)) return true; // Line is just a brace
        if (/^\s*(?:\w+\s+)*\w+\([^)]*\)\s*\{/.test(line)) return true; // Function definition line
        if (/\breturn\b/.test(line) || /;/.test(line)) return true; // Line contains 'return' or ';' (likely code)
        return false;
    }

    // Helper to classify a token as math or text
    function isMathToken(token, prevToken, nextToken) {
        if (token.startsWith("%%CODE") || token.startsWith("%%MATH")) {
            return "placeholder"; // Already-protected code or math segment
        }
        // Contains LaTeX command or special math characters
        if (/[\\^_]/.test(token)) return true;
        if (/[=<>+\-*\/]/.test(token)) {
            // Treat isolated '-' at line start as a list bullet, not a math minus
            if (
                token === "-" &&
                (!prevToken || prevToken.trim() === "") &&
                nextToken &&
                /^[A-Za-z]/.test(nextToken)
            ) {
                return false;
            }
            return true;
        }
        if (/[A-Za-z]/.test(token) && /\d/.test(token)) return true; // Mix of letters and digits (e.g., "2x")
        if (/^\d+$/.test(token)) return false; // Pure number (could be text context)
        if (/^[A-Za-z]+$/.test(token)) {
            const lower = token.toLowerCase();
            if (token.length === 1) {
                // Single letters (variables) are math, except standalone 'a' or 'I' (likely text)
                if (token === "a" || token === "I") return false;
                return true;
            }
            const mathFunctions = [
                "sin",
                "cos",
                "tan",
                "cot",
                "sec",
                "csc",
                "log",
                "ln",
                "exp",
                "lim",
                "min",
                "max"
            ];
            if (mathFunctions.includes(lower)) return true; // Known math function names
            return false; // Other words are treated as text
        }
        if (/\w+\(.*\)/.test(token)) return true; // Word followed by parentheses (e.g., "cos(x)")
        return false;
    }

    // Process each line
    const lines = text.split("\n");
    const processedLines = lines.map((line) => {
        if (/^%%CODE\d+%%$/.test(line.trim()) || isCodeLine(line)) {
            // Return protected code block or code-like line unchanged
            return line;
        }

        // Split line into tokens (preserving whitespace and punctuation)
        const parts = line.split(/(\s+)/);
        const tokens: string[] = [];
        for (let part of parts) {
            if (part === "") continue;
            if (!/\s/.test(part)) {
                // Separate trailing punctuation from the token for individual handling
                while (part.length > 1 && /[.,;:!?]$/.test(part)) {
                    const punct = part.slice(-1);
                    part = part.slice(0, -1);
                    if (part !== "") tokens.push(part);
                    tokens.push(punct);
                    part = "";
                }
                if (part !== "") tokens.push(part);
            } else {
                tokens.push(part);
            }
        }

        // Classify each token as math (true), text (false), placeholder, or punctuation
        const tokenTypes = tokens.map((tok, i) => {
            if (tok.trim() === "") return "whitespace";
            if (/^[.,;:!?]$/.test(tok)) return "punctuation";
            // Determine neighboring tokens for context
            let prevToken: string | null = null,
                nextToken: string | null = null;
            for (let j = i - 1; j >= 0; j--) {
                if (tokens[j].trim() !== "") {
                    prevToken = tokens[j];
                    break;
                }
            }
            for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j].trim() !== "") {
                    nextToken = tokens[j];
                    break;
                }
            }
            return isMathToken(tok, prevToken, nextToken);
        });

        // Adjust isolated numbers/letters if surrounded by math context
        for (let i = 0; i < tokens.length; i++) {
            if (
                tokenTypes[i] === false &&
                (/^\d+$/.test(tokens[i]) || /^[A-Za-z]$/.test(tokens[i]))
            ) {
                let prevMath = false,
                    nextMath = false;
                // Check previous non-whitespace token
                for (let j = i - 1; j >= 0; j--) {
                    if (tokenTypes[j] === "whitespace") continue;
                    if (tokenTypes[j] === true) prevMath = true;
                    break;
                }
                // Check next non-whitespace token
                for (let j = i + 1; j < tokens.length; j++) {
                    if (tokenTypes[j] === "whitespace") continue;
                    if (tokenTypes[j] === true) nextMath = true;
                    break;
                }
                if (prevMath || nextMath) {
                    tokenTypes[i] = true;
                }
            }
        }

        // If punctuation is between two math tokens, treat it as part of math
        for (let i = 0; i < tokenTypes.length; i++) {
            if (tokenTypes[i] === "punctuation") {
                // Find nearest non-whitespace neighbors
                let prevType:
                        | boolean
                        | "whitespace"
                        | "punctuation"
                        | "placeholder"
                        | null = null,
                    nextType:
                        | boolean
                        | "whitespace"
                        | "punctuation"
                        | "placeholder"
                        | null = null;
                let j = i - 1;
                while (j >= 0 && tokenTypes[j] === "whitespace") j--;
                if (j >= 0) prevType = tokenTypes[j];
                j = i + 1;
                while (j < tokenTypes.length && tokenTypes[j] === "whitespace")
                    j++;
                if (j < tokenTypes.length) nextType = tokenTypes[j];
                if (prevType === true && nextType === true) {
                    tokenTypes[i] = true;
                }
            }
        }

        // Reconstruct the line with appropriate math delimiters
        let outputLine = "";
        let inMath = false;
        for (let i = 0; i < tokens.length; i++) {
            const type = tokenTypes[i];
            const tok = tokens[i];
            if (type === "whitespace") {
                if (inMath) {
                    // If next significant token is text, delay adding this space (close math first)
                    let k = i + 1;
                    while (k < tokens.length && tokenTypes[k] === "whitespace")
                        k++;
                    if (k < tokens.length && tokenTypes[k] === false) continue;
                }
                outputLine += tok;
            } else if (type === "placeholder") {
                if (inMath) {
                    outputLine += "\\)";
                    inMath = false;
                }
                outputLine += tok;
            } else if (type === "punctuation") {
                if (inMath) {
                    outputLine += "\\)";
                    inMath = false;
                }
                outputLine += tok;
            } else if (type === true) {
                // math token
                if (!inMath) {
                    outputLine += "\\(";
                    inMath = true;
                }
                outputLine += tok;
            } else if (type === false) {
                // text token
                if (inMath) {
                    outputLine += "\\)";
                    inMath = false;
                }
                // If a skipped whitespace was before this text (after closing math), add it now
                if (i > 0 && tokenTypes[i - 1] === "whitespace") {
                    let prevNonSpace = i - 1;
                    while (
                        prevNonSpace >= 0 &&
                        tokenTypes[prevNonSpace] === "whitespace"
                    )
                        prevNonSpace--;
                    if (
                        prevNonSpace >= 0 &&
                        tokenTypes[prevNonSpace] === true
                    ) {
                        // output all consecutive whitespace tokens before this position
                        for (let m = prevNonSpace + 1; m < i; m++) {
                            if (tokenTypes[m] === "whitespace")
                                outputLine += tokens[m];
                        }
                    }
                }
                outputLine += tok;
            }
        }
        if (inMath) {
            outputLine += "\\)"; // close any unclosed math at end of line
        }
        return outputLine;
    });

    // Restore original math and code segments from placeholders
    text = processedLines.join("\n");
    text = text.replace(
        /%%MATH(\d+)%%/g,
        (_, p1) => mathPlaceholders[Number(p1)]
    );
    text = text.replace(
        /%%CODE(\d+)%%/g,
        (_, p1) => codePlaceholders[Number(p1)]
    );
    // Restore [asy] blocks
    text = text.replace(
        /%%ASY(\d+)%%/g,
        (_, p1) => asyPlaceholders[Number(p1)]
    );
    return text;
}

const SimpleMathTextBox: FunctionComponent<{
    children: React.ReactNode;
    className?: string;
}> = ({ children, className }) => {
    const [loading, setLoading] = useState<boolean>(true);
    const [renderTexMath, setRenderTexMath] = useState<boolean>(false);

    return (
        <Panel
            className={
                className
                    ? className + " simple-math-text-box-container"
                    : "simple-math-text-box-container"
            }
            header={
                <Toggle
                    checkedChildren="Render Tex Math"
                    unCheckedChildren="Render Tex Math"
                    checked={renderTexMath}
                    onChange={setRenderTexMath}
                />
            }
        >
            {loading && renderTexMath ? <Loader content="Loading..." /> : null}
            {renderTexMath ? (
                <SimpleMathTextRenderBox setLoading={setLoading}>
                    {children}
                </SimpleMathTextRenderBox>
            ) : (
                <pre className="simple-math-text-box-content">{children}</pre>
            )}
        </Panel>
    );
};

const SimpleMathTextRenderBox: FunctionComponent<{
    children: React.ReactNode;
    setLoading?: (boolean) => void;
}> = ({ children, setLoading }) => {
    const preRef = React.useRef<any>(null);
    const [processedText, setProcessedText] = useState<string>("");

    useAsync(
        async (children, setProcessedText, setLoading) => {
            if (typeof children === "string") {
                setLoading(true);
                setProcessedText(wrapLatexInMath(children));
            } else {
                setProcessedText(children);
            }
            setLoading(false);
        },
        [children, setProcessedText, setLoading]
    );

    useAsync(
        async (processedText, preRef, setLoading) => {
            if (!processedText || !preRef.current) {
                return;
            }
            setLoading(true);
            const el = preRef.current;
            renderMathInElement(el, {
                throwOnError: false,
                strict: false,
                output: "html",
                delimiters: [
                    { left: "$$", right: "$$", display: true },
                    { left: "$", right: "$", display: false },
                    { left: "\\(", right: "\\)", display: false },
                    { left: "\\[", right: "\\]", display: true },
                    {
                        left: "\\begin{equation}",
                        right: "\\end{equation}",
                        display: true
                    },
                    {
                        left: "\\begin{align}",
                        right: "\\end{align}",
                        display: true
                    },
                    {
                        left: "\\begin{alignat}",
                        right: "\\end{alignat}",
                        display: true
                    },
                    {
                        left: "\\begin{gather}",
                        right: "\\end{gather}",
                        display: true
                    },
                    { left: "\\begin{CD}", right: "\\end{CD}", display: true }
                ]
            });
            setLoading(false);
        },
        [processedText, preRef, setLoading]
    );

    return (
        <pre className="simple-math-text-box-content" ref={preRef}>
            {processedText ? processedText : children}
        </pre>
    );
};

export default SimpleMathTextBox;
