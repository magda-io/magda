import retext from "retext";
import keywords from "retext-keywords";
import toString from "nlcst-to-string";
import { isValidKeyword } from "../../../helpers/VocabularyApis";

/**
 * Extract keywords from text based file formats
 */
export async function extractKeywords(input, output) {
    if (input.text) {
        const candicateKeywords = (output.keywords || []).concat(
            await getKeywords(input.text)
        );
        const keywords = [];
        for (let i = 0; i < candicateKeywords.length; i++) {
            const result = await isValidKeyword(candicateKeywords[i]);
            if (result) {
                keywords.push(candicateKeywords[i]);
            }
        }
        output.keywords = keywords;
    }
}

function getKeywords(text, maximum = 10) {
    return new Promise(async (resolve, reject) => {
        retext()
            .use(keywords, {
                maximum
            })
            .process(text, done);

        function done(err, file) {
            if (err) throw err;
            let keyphrases = [];
            file.data.keyphrases.forEach(function(phrase) {
                keyphrases.push(phrase.matches[0].nodes.map(toString).join(""));
            });
            resolve(keyphrases);
        }
    });
}
