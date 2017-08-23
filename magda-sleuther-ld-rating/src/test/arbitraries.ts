import {
  jsc,
  fuzzStringArbResult
} from "@magda/typescript-common/src/test/arbitraries";

import jsverify = require("jsverify");
import openLicenses from "../openLicenses";
import openFormats from "../openFormats";

export const openLicenseArb = (jsc: jsc): jsverify.Arbitrary<string> =>
  fuzzStringArbResult(jsc, jsc.elements(openLicenses));

export const formatArb = (
  jsc: jsc,
  starCount: number
): jsverify.Arbitrary<string> =>
  fuzzStringArbResult(jsc, jsc.elements(openFormats[starCount]));
