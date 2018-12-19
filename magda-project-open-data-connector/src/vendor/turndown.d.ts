declare module "turndown" {
    class TurndownService {
        constructor(options?: Options);

        public addRule(key: string, rule: Rule): this;
        public keep(filter: Filter): this;
        public remove(filter: Filter): this;
        public use(plugins: Plugin | Array<Plugin>): this;

        public turndown(html: string | Node): string;
    }

    interface Options {
        headingStyle?: "setext" | "atx";
        hr?: string;
        bulletListMarker?: "-" | "+" | "*";
        emDelimiter?: "_" | "*";
        codeBlockStyle?: "indented" | "fenced";
        fence?: "```" | "~~~";
        strongDelimiter?: "__" | "**";
        linkStyle?: "inlined" | "referenced";
        linkReferenceStyle?: "full" | "collapsed" | "shortcut";

        keepReplacement?: ReplacementFunction;
        blankReplacement?: ReplacementFunction;
        defaultReplacement?: ReplacementFunction;
    }

    interface Rule {
        filter: Filter;
        replacement?: ReplacementFunction;
    }

    type Plugin = (service: TurndownService) => void;

    type Filter = TagName | Array<TagName> | FilterFunction;
    type FilterFunction = (node: HTMLElement, options: Options) => boolean;

    type ReplacementFunction = (
        content: string,
        node: HTMLElement,
        options: Options
    ) => string;

    type Node = HTMLElement | Document | DocumentFragment;
    type TagName = keyof HTMLElementTagNameMap;

    export = TurndownService;
}
