export { default as SemanticIndexerOptions } from "./semanticIndexerOptions.js";
export { commonSemanticIndexerYargs } from "./commonSemanticIndexerYargs.js";

export { ItemType, SemanticIndexDocument } from "./indexSchema.js";

export {
    CreateEmbeddingText,
    CreateEmbeddingTextParams,
    EmbeddingText
} from "./createEmbeddingText.js";

export { Chunker, FixedLengthChunkStrategy } from "./chunker.js";
export { indexEmbeddingText } from "./indexEmbeddingText.js";
export { onRecordFoundRegistryRecord } from "./onRecordFoundRegistryRecord.js";
export { onRecordFoundStorageObject } from "./onRecordFoundStorageObject.js";
export { config } from "./config.js";

import semanticIndexer from "./semanticIndexer.js";
export default semanticIndexer;
