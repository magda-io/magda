export function jsonToYaml(jsonStr: string) {
    const obj = JSON.parse(jsonStr);
    return toYaml(obj, 0);
}

function toYaml(obj: any, indentLevel = 0) {
    const indent = "  ".repeat(indentLevel);
    let yamlStr = "";

    if (Array.isArray(obj)) {
        for (const item of obj) {
            if (typeof item === "object" && item !== null) {
                yamlStr += `${indent}-\n${toYaml(item, indentLevel + 1)}`;
            } else {
                yamlStr += `${indent}- ${formatValue(item)}\n`;
            }
        }
    } else if (typeof obj === "object" && obj !== null) {
        for (const key in obj) {
            const value = obj[key];
            if (typeof value === "object" && value !== null) {
                yamlStr += `${indent}${key}:\n${toYaml(
                    value,
                    indentLevel + 1
                )}`;
            } else if (Array.isArray(value)) {
                yamlStr += `${indent}${key}:\n${toYaml(
                    value,
                    indentLevel + 1
                )}`;
            } else {
                yamlStr += `${indent}${key}: ${formatValue(value)}\n`;
            }
        }
    } else {
        yamlStr += `${indent}${formatValue(obj)}\n`;
    }

    return yamlStr;
}

function formatValue(value: any) {
    if (typeof value === "string") {
        if (value.includes("\n")) {
            return `|\n  ${value.replace(/\n/g, "\n  ")}`;
        } else {
            return `"${value}"`;
        }
    } else if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    } else if (value === null) {
        return "null";
    } else {
        return String(value);
    }
}

export default toYaml;
