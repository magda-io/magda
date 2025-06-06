// import { commonSemanticIndexerYargs } from "../commonSemanticIndexerYargs.js";
// import semanticIndexer from "../semanticIndexer.js";
// import { CreateEmbeddingText, CreateEmbeddingTextParams, EmbeddingText } from "../createEmbeddingText.js";
// import fs from "fs";

// const yargs = commonSemanticIndexerYargs(
//     6545,
//     "http://localhost:6545"
// )

// const createEmbeddingText: CreateEmbeddingText = async (input: CreateEmbeddingTextParams) => {
//     const record = input.record;
//     const format = input.format;
//     const filePath = input.filePath;
//     const url = input.url;

//     let text = "";
//     if (record) text += `record exists: ${JSON.stringify(record).slice(0, 20)}...\n`;
//     if (format) text += `format exists: ${format}\n`;
//     if (filePath) text += `filePath exists: ${filePath}\n`;
//     if (url) text += `url exists: ${url}\n`;
//     if (format === "csv") {
//         if (filePath && fs.existsSync(filePath)) {
//             text += `file exists: ${filePath}\n`;
//         }
//     }
//     return ({
//         text: text
//     } as EmbeddingText)
// }

// semanticIndexer({
//     argv: yargs,
//     id: "csv-indexer3",
//     itemType: "storageObject",
//     createEmbeddingText: createEmbeddingText,
//     formatTypes: ["csv"],
//     autoDownloadFile: true,
//     chunkSize: 100,
//     overlap: 0,
// })
