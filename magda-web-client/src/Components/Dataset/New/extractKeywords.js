"use strict";

import retext from "retext";
import keywords from "retext-keywords";
import toString from "nlcst-to-string";

/**
 * Extract keywords from text based file formats
 */
export async function extractKeywords(input, output) {
    const inp = input.text;
    if (input.text) {
        output.keywords = (output.keywords || []).concat(
            await getKeywords(input.text)
        );
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
