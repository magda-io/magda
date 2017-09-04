///<reference path="./jsverify.d.ts" />
import * as jsverify from "jsverify";
const { curried2 } = require("jsverify/lib/utils");
import { Record } from "../generated/registry/api";
const lazyseq = require("lazy-seq");
import uuid = require("uuid/v4");
import * as _ from "lodash";

function fromCode(code: number) {
  return String.fromCharCode(code);
}

function toCode(c: string) {
  return c.charCodeAt(0);
}

export type jsc = {
  integer: jsverify.Arbitrary<number> &
    jsverify.integerFn &
    jsverify.integerFn2;

  oneof: <T>(x: jsverify.Arbitrary<T>[]) => jsverify.Arbitrary<T>;
  array: <T>(arb: jsverify.Arbitrary<T>) => jsverify.Arbitrary<T[]>;
  nearray: <T>(arb: jsverify.Arbitrary<T>) => jsverify.Arbitrary<T[]>;
  record<T>(
    arbs: { [P in keyof T]: jsverify.Arbitrary<T[P]> }
  ): jsverify.Arbitrary<T>;
  string: jsverify.Arbitrary<string>;
  json: jsverify.Arbitrary<any>;
  constant<T>(x: T): jsverify.Arbitrary<T>;
  suchthat<U>(
    arb: jsverify.Arbitrary<U>,
    predicate: (u: U) => boolean
  ): jsverify.Arbitrary<U>;
  shrink: jsverify.ShrinkFunctions;
  generator: jsverify.GeneratorFunctions;
  show: jsverify.ShowFunctions;
  bless<U>(arb: jsverify.ArbitraryLike<U>): jsverify.Arbitrary<U>;
  number: jsverify.Arbitrary<number> & jsverify.integerFn & jsverify.integerFn2;
  nat: jsverify.Arbitrary<number> & jsverify.integerFn;
  elements<T>(args: T[]): jsverify.Arbitrary<T>;
  tuple(arbs: jsverify.Arbitrary<any>[]): jsverify.Arbitrary<any[]>;
  bool: jsverify.Arbitrary<boolean>;
  char: jsverify.Arbitrary<string>;
  asciichar: jsverify.Arbitrary<string>;
  // tslint:disable-next-line:variable-name
  nestring: jsverify.Arbitrary<string>;
  asciistring: jsverify.Arbitrary<string>;
  asciinestring: jsverify.Arbitrary<string>;
  sampler<U>(
    arb: jsverify.Arbitrary<U>,
    genSize?: number
  ): (sampleSize: number) => U;
};

export const lowerCaseAlphaCharArb = ({ integer }: jsc) =>
  integer(97, 122).smap(fromCode, toCode);
export const numArb = ({ integer }: jsc) =>
  integer(48, 57).smap(fromCode, toCode);
export const lcAlphaNumCharArb = (jsc: jsc) =>
  jsc.oneof([numArb(jsc), lowerCaseAlphaCharArb(jsc)]);
export const lcAlphaNumStringArb = (jsc: jsc) =>
  jsc
    .array(lcAlphaNumCharArb(jsc))
    .smap((arr: any) => arr.join(""), (string: string) => string.split(""));
export const lcAlphaNumStringArbNe = (jsc: jsc) =>
  jsc
    .nearray(lcAlphaNumCharArb(jsc))
    .smap((arr: any) => arr.join(""), (string: string) => string.split(""));

const uuidArb: (jsc: jsc) => jsverify.Arbitrary<string> = (jsc: jsc) =>
  jsc.bless({
    generator: jsc.generator.bless(x => uuid()),
    shrink: jsc.shrink.bless(x => []),
    show: (x: string) => x
  });

export const recordArb = (jsc: jsc) =>
  jsc.record<Record>({
    id: uuidArb(jsc), //lcAlphaNumStringArb(jsc),
    name: jsc.string,
    aspects: jsc.array(jsc.json)
  });

export const specificRecordArb = (jsc: jsc) => (aspectArbs: {
  [key: string]: jsverify.Arbitrary<any>;
}) =>
  jsc.record<Record>({
    id: uuidArb(jsc), //lcAlphaNumStringArbNe(jsc),
    name: jsc.string,
    aspects: jsc.record(aspectArbs)
  });

const defaultSchemeArb = (jsc: jsc) =>
  jsc.oneof([
    jsc.constant("http"),
    jsc.constant("https"),
    jsc.constant("ftp"),
    lcAlphaNumStringArbNe(jsc)
  ]);

type UrlArbOptions = {
  schemeArb?: jsverify.Arbitrary<string>;
  hostArb?: jsverify.Arbitrary<string>;
};

function shrinkArrayWithMinimumSize<T>(
  jsc: jsc,
  size: number
): (x: jsverify.Shrink<T>) => jsverify.Shrink<T[]> {
  function shrinkArrayImpl(...args: any[]) {
    const shrink: (x: any) => Array<any> = args[0];
    const result: any = jsc.shrink.bless(function(arr: Array<any>) {
      if (arr.length <= size) {
        return lazyseq.nil;
      } else {
        var x = arr[0];
        var xs = arr.slice(1);

        return lazyseq
          .cons(xs, lazyseq.nil)
          .append(
            shrink(x).map(function(xp: any) {
              return [xp].concat(xs);
            })
          )
          .append(
            shrinkArrayImpl(shrink, xs).map(function(xsp: any) {
              return [x].concat(xsp);
            })
          );
      }
    });

    return curried2(result, args);
  }

  return shrinkArrayImpl;
}

export type MonadicArb<T> = jsverify.Arbitrary<T> & {
  flatMap<U>(
    arbForward: (t: T) => jsverify.Arbitrary<U>,
    backwards: (u: U) => T
  ): MonadicArb<U>;
};

/** Sometimes jsverify returns a lazy-seq when it should return an array, this makes sure it's an array. */
function unSeq<T>(maybeArray: any): T[] {
  return maybeArray.toArray ? maybeArray.toArray() : maybeArray;
}

export function arbFlatMap<T, U>(
  jsc: jsc,
  arb: jsverify.Arbitrary<T>,
  arbForward: (t: T) => jsverify.Arbitrary<U>,
  backwards: (u: U) => T,
  show: (u: U) => string | undefined = u => JSON.stringify(u)
): MonadicArb<U> {
  const x = jsc.bless<U>({
    generator: arb.generator.flatmap((t: T) => {
      return arbForward(t).generator;
    }),
    show,
    shrink: jsc.shrink.bless((u: U) => {
      const t = backwards(u);

      if (_.isUndefined(t)) {
        return [];
      }

      const ts = unSeq<T>(arb.shrink(t));
      const us = _(ts)
        .flatMap(thisT => {
          const newArb = arbForward(thisT);
          const newU = (jsc.sampler(newArb, ts.length)(1) as any)[0];
          return _.take(unSeq<U>(newArb.shrink(newU)), 3);
        })
        .value();

      return us;
    })
  });

  return {
    ...x,
    flatMap<V>(
      arbForward: (u: U) => jsverify.Arbitrary<V>,
      backwards: (v: V) => U
    ): MonadicArb<V> {
      return arbFlatMap<U, V>(jsc, x, arbForward, backwards);
    }
  };
}

function generateArrayOfSize<T>(
  jsc: jsc,
  arrSize: number,
  gen: jsverify.Generator<T>
): jsverify.Generator<T[]> {
  var result = jsc.generator.bless(function(size: number) {
    var arr = new Array(arrSize);
    for (var i = 0; i < arrSize; i++) {
      arr[i] = gen(size);
    }
    return arr;
  });

  return curried2(result, arguments);
}

/** Generates an array that is guaranteed to be of the supplied size */
export function arrayOfSizeArb<T>(
  jsc: jsc,
  size: number,
  arb: jsverify.Arbitrary<T>
): jsverify.Arbitrary<T[]> {
  return jsc.bless<T[]>({
    generator: generateArrayOfSize(jsc, size, arb.generator),
    shrink: shrinkArrayWithMinimumSize<T>(jsc, size)(arb.shrink),
    show: x => x.toString()
  });
}

/**
 * Randomly generates a scheme, host, port and path for a URL.
 */
const urlPartsArb = (jsc: jsc, options: UrlArbOptions) =>
  jsc.record({
    scheme: options.schemeArb,
    host: jsc.suchthat(
      options.hostArb,
      (string: string) => !string.startsWith("ftp")
    ),
    port: jsc.oneof([
      jsc.integer(1, 65000),
      jsc.constant(80),
      jsc.constant(21)
    ]),
    path: jsc.array(lcAlphaNumStringArbNe(jsc))
  });

/** Generates a URL for a distribution - this could be ftp, http or https */
export const distUrlArb = (
  jsc: jsc,
  {
    schemeArb = defaultSchemeArb(jsc),
    hostArb = lcAlphaNumStringArbNe(jsc)
  }: UrlArbOptions = {}
) =>
  urlPartsArb(jsc, { schemeArb, hostArb }).smap(
    urlParts => {
      const port =
        (urlParts.scheme === "http" && urlParts.port === 80) ||
        (urlParts.scheme === "ftp" && urlParts.port === 21)
          ? ""
          : ":" + urlParts.port;

      return `${urlParts.scheme}://${urlParts.host}.com${port}/${(urlParts.path ||
        [])
        .join("/")}` as string;
    },
    (url: string) => {
      const splitAfterScheme = url.split("://");
      const scheme = splitAfterScheme[0];
      const splitOnDotCom = splitAfterScheme[1].split(/\.com:?/);
      const host = splitOnDotCom[0];
      const pathSegments = splitOnDotCom[1].split("/");
      const port: number = parseInt(pathSegments[0]);
      const path = pathSegments.slice(1);
      return { scheme, host, port, path };
    }
  );

/**
 * Can be passed into distStringsArb to override the default arbitraries.
 */
export type DistStringsOverrideArbs = {
  url?: jsverify.Arbitrary<string>;
  license?: jsverify.Arbitrary<string>;
  format?: jsverify.Arbitrary<string>;
};

/**
 * Generates the content of a distribution's dcat-distribution-strings aspect.
 */
export const distStringsArb = (
  jsc: jsc,
  {
    url = jsc.oneof([distUrlArb(jsc), jsc.constant(undefined)]),
    license = jsc.string,
    format = jsc.string
  }: DistStringsOverrideArbs
) =>
  jsc.record({
    downloadURL: url,
    accessURL: url,
    license,
    format
  });

/**
   * Generates records, allowing specific arbs to be defined for the distribution.
   */
export const recordArbWithDistArbs = (
  jsc: jsc,
  overrides: DistStringsOverrideArbs = {}
) =>
  specificRecordArb(jsc)({
    "dataset-distributions": jsc.record({
      distributions: jsc.array(
        specificRecordArb(jsc)({
          "dcat-distribution-strings": distStringsArb(jsc, overrides)
        })
      )
    })
  });

/**
 * Randomly generates a record with the passed objects under its
 * distributions' dcat-distribution-strings aspect.
 */
export const recordArbWithDists = (jsc: jsc, dists: object[]) =>
  specificRecordArb(jsc)({
    "dataset-distributions": jsc.record({
      distributions: jsc.tuple(
        dists.map(dist =>
          specificRecordArb(jsc)({
            "dcat-distribution-strings": jsc.constant(dists)
          })
        )
      )
    })
  });

/**
 * Randomly returns a subset of the array, in-order.
 */
export function someOf<T>(jsc: jsc, array: T[]): jsverify.Arbitrary<T[]> {
  return jsc
    .record({
      length: jsc.integer(0, array.length),
      start: jsc.integer(0, array.length - 1)
    })
    .smap(
      ({ length, start }) => _(array).drop(start).take(length).value(),
      (newArray: T[]) => {
        const start = _.indexOf(array, newArray[0]);
        const length = newArray.length - start;

        return { start, length };
      }
    );
}

/**
 * Fuzzes a string, changing the case and putting random strings around it
 * and in spaces.
 */
export function fuzzStringArb(
  jsc: jsc,
  string: string,
  fuzzArb: jsverify.Arbitrary<string> = stringArb(jsc)
): jsverify.Arbitrary<string> {
  const words = string.split(/[^a-zA-Z\d]+/);
  const aroundArbs = arrayOfSizeArb(jsc, words.length + 1, fuzzArb);

  return arbFlatMap(
    jsc,
    aroundArbs,
    around => {
      const string = _(around).zip(words).flatten().join("");
      const caseArb = arrayOfSizeArb(jsc, string.length, jsc.bool);
      return jsc.record({ string: jsc.constant(string), cases: caseArb });
    },
    ({ string, cases }) => {
      const wordsRegex = new RegExp(words.join("|"));
      return string.split(wordsRegex);
    }
  ).smap(
    ({ string, cases }) =>
      _.map(string, (char, index) => {
        if (cases[index]) {
          return char.toUpperCase();
        } else {
          return char.toLowerCase();
        }
      }).join(""),
    string => ({
      cases: _.map(string, (char, index) => char === char.toUpperCase()),
      string
    })
  );
}

/**
 * Gets the result of the passed string arbitrary and fuzzes it, changing
 * the case and putting random strings around it and in spaces.
 */
export function fuzzStringArbResult(
  jsc: jsc,
  stringArb: jsverify.Arbitrary<string>,
  fuzzArb?: jsverify.Arbitrary<string>
) {
  return arbFlatMap(
    jsc,
    stringArb,
    string => fuzzStringArb(jsc, string, fuzzArb),
    fuzzedString => undefined
  );
}

function charArb(jsc: jsc) {
  return jsc.integer(32, 0xff).smap(fromCode, toCode);
}

/**
 * Generates a random string with characters greater than code 32 (so no random
 * TTY crap that can't be matched by any regex
 */
export function stringArb(jsc: jsc) {
  return jsc
    .array(charArb(jsc))
    .smap(chars => chars.join(""), string => string.split(""));
}
