import jsc, { Arbitrary } from "jsverify";
import {
    peopleNameArb,
    lcAlphaNumStringArbNe
} from "magda-typescript-common/src/test/arbitraries.js";
import { User } from "magda-typescript-common/src/authorization-api/model.js";

export const emailArb: Arbitrary<string> = jsc
    .tuple([
        lcAlphaNumStringArbNe,
        jsc.constant("@"),
        lcAlphaNumStringArbNe,
        jsc.constant(".com")
    ])
    .smap(
        function (x) {
            return x.join("");
        },
        function (email): [string, string, string, string] {
            const items = [];
            let parts = email.split("@");
            items.push(parts[0], "@");
            parts = parts[1].split(".com");
            items.push(parts[0], ".com");
            return items as [string, string, string, string];
        }
    );

export const urlArb: Arbitrary<string> = jsc
    .tuple([
        jsc.constant("http://"),
        lcAlphaNumStringArbNe,
        jsc.constant(".com")
    ])
    .smap(
        function (x) {
            return x.join("");
        },
        function (url) {
            return [
                "http://",
                url.replace(/^http\:\/\//, "").replace(/\.com/, ""),
                ".com"
            ];
        }
    );

export const userDataArb = jsc.record<User>({
    displayName: peopleNameArb,
    email: emailArb,
    photoURL: urlArb,
    source: lcAlphaNumStringArbNe,
    sourceId: lcAlphaNumStringArbNe,
    isAdmin: jsc.bool
});
