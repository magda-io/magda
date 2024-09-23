export default function addRobotsMeta(
    indexContent: string,
    robotsMetaContent: string = "noindex",
    robotName: string = "robots"
) {
    return indexContent.replace(
        "</head>",
        `<meta name="${robotName}" content="${robotsMetaContent}">\n</head>`
    );
}
