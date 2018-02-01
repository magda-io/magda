import jsc from "@magda/typescript-common/dist/test/jsverify";
import {
    peopleNameArb,
    lcAlphaNumStringArbNe
} from "@magda/typescript-common/dist/test/arbitraries";
import { User } from "@magda/typescript-common/dist/authorization-api/model";

export const emailArb: jsc.Arbitrary<string> = jsc
    .tuple([
        lcAlphaNumStringArbNe,
        jsc.constant("@"),
        lcAlphaNumStringArbNe,
        jsc.constant(".com")
    ])
    .smap(
        function(x) {
            return x.join("");
        },
        function(email) {
            const items = [];
            let parts = email.split("@");
            items.push(parts[0], "@");
            parts = parts[1].split(".com");
            items.push(parts[0], ".com");
            return items;
        }
    );

export const urlArb: jsc.Arbitrary<string> = jsc
    .tuple([
        jsc.constant("http://"),
        lcAlphaNumStringArbNe,
        jsc.constant(".com")
    ])
    .smap(
        function(x) {
            return x.join("");
        },
        function(url) {
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
