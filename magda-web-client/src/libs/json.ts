// Adapted from https://github.com/langchain-ai/langchainjs/blob/a4448fe56384a0c73802109b204742f5c5027d96/langchain-core/src/utils/json.ts
// MIT License
export function parseJsonMarkdown<T = any>(
    s: string,
    parser = parsePartialJson
): T | null {
    // eslint-disable-next-line no-param-reassign
    s = s.trim();
    const match = /```(json)?(.*)```/s.exec(s);
    if (!match) {
        return parser(s);
    } else {
        return parser(match[2]);
    }
}

// Adapted from https://github.com/KillianLucas/open-interpreter/blob/main/interpreter/core/llm/utils/parse_partial_json.py
// MIT License
export function parsePartialJson<T = any>(s: string): T | null {
    // If the input is undefined, return null to indicate failure.
    if (typeof s === "undefined") {
        return null;
    }

    // Attempt to parse the string as-is.
    try {
        return JSON.parse(s);
    } catch (error) {
        // Pass
    }

    // Initialize variables.
    let new_s = "";
    const stack: string[] = [];
    let isInsideString = false;
    let escaped = false;

    // Process each character in the string one at a time.
    for (let char of s) {
        if (isInsideString) {
            if (char === '"' && !escaped) {
                isInsideString = false;
            } else if (char === "\n" && !escaped) {
                char = "\\n"; // Replace the newline character with the escape sequence.
            } else if (char === "\\") {
                escaped = !escaped;
            } else {
                escaped = false;
            }
        } else {
            if (char === '"') {
                isInsideString = true;
                escaped = false;
            } else if (char === "{") {
                stack.push("}");
            } else if (char === "[") {
                stack.push("]");
            } else if (char === "}" || char === "]") {
                if (stack && stack[stack.length - 1] === char) {
                    stack.pop();
                } else {
                    // Mismatched closing character; the input is malformed.
                    return null;
                }
            }
        }

        // Append the processed character to the new string.
        new_s += char;
    }

    // If we're still inside a string at the end of processing,
    // we need to close the string.
    if (isInsideString) {
        new_s += '"';
    }

    // Close any remaining open structures in the reverse order that they were opened.
    for (let i = stack.length - 1; i >= 0; i -= 1) {
        new_s += stack[i];
    }

    // Attempt to parse the modified string as JSON.
    try {
        return JSON.parse(new_s);
    } catch (error) {
        // If we still can't parse the string as JSON, return null to indicate failure.
        return null;
    }
}
