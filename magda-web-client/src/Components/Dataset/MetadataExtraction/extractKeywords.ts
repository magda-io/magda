import { retext } from "retext";
import retextKeywords from "retext-keywords";
import retextPos from "retext-pos";
import { toString } from "nlcst-to-string";
import { isValidKeyword } from "api-clients/VocabularyApis";
import uniq from "lodash/uniq";
import { ExtractedContents, FileDetails } from "./types";
import type { MessageSafeConfig } from "config";

/** The maximum number of characters to feed into retext (input after this char length will be trimmed off) */
const MAX_CHARACTERS_FOR_EXTRACTION = 150000;
/** The maximum number of keywords to return */
export const MAX_KEYWORDS = 10;

/** Turns all instances of one or more whitespace characters (space, newline etc) into a single space */
function standardizeWhitespace(keyword: string) {
    return keyword.replace(/\s+/g, " ").trim();
}

function cleanUpKeywords(keywords: string[], config: MessageSafeConfig) {
    let cleaned = uniq(
        keywords.map((kw) => standardizeWhitespace(kw).toLowerCase())
    );
    const keywordsBlackList =
        config.keywordsBlackList &&
        config.keywordsBlackList.map((kw) => kw.toLowerCase());
    if (keywordsBlackList) {
        cleaned = cleaned.filter(
            (keyword) =>
                !keywordsBlackList.some(
                    (blackListed) => keyword.indexOf(blackListed) > -1
                )
        );
    }
    return cleaned;
}

/**
 * Extract keywords from text based file formats
 */
export async function extractKeywords(
    _input: FileDetails,
    _array: Uint8Array,
    depInput: ExtractedContents,
    config: MessageSafeConfig
) {
    let keywords = [] as string[];

    // please note: `largeTextBlockIdentified` can be undefined
    // only spreadsheet like source will set this field
    if (depInput.text && depInput.largeTextBlockIdentified !== false) {
        // Only take up to a certain length - anything longer results in massive delays and the browser
        // prompting with a "Should I stop this script?" warning.
        const trimmedText = depInput.text
            .replace(/\u0000/g, "")
            .slice(0, MAX_CHARACTERS_FOR_EXTRACTION);

        const candidateKeywords = keywords.concat(
            await getKeywordsFromText(trimmedText)
        );

        const validatedKeywords: string[] = [];
        for (let i = 0; i < candidateKeywords.length; i++) {
            const result = await isValidKeyword(candidateKeywords[i], config);
            if (result) {
                validatedKeywords.push(candidateKeywords[i]);
            }
        }

        // Put the validated keywords first then invalidated, so that if it goes over MAX_KEYWORDS
        // the invalidated ones will be the ones trimmed.
        keywords = [...validatedKeywords, ...candidateKeywords];
    }

    return {
        keywords: keywords = cleanUpKeywords(keywords, config).slice(0, 10)
    };
}

async function getKeywordsFromText(
    text: string,
    maximum: number = MAX_KEYWORDS * 2
): Promise<string[]> {
    const file = await retext()
        .use(retextPos)
        .use(retextKeywords, { maximum })
        .process(text);
    const keyPhrases: string[] = [];
    file.data.keyphrases?.forEach(function (phrase) {
        keyPhrases.push(phrase.matches[0].nodes.map(toString).join(""));
    });

    return keyPhrases;
}
