export interface Options {
    schema: any;
    inMemory?: boolean;
    keepHistory?: boolean;
    summaryFields?: string[];
    // deriveFields?: Funtion:
}

export interface Version {
    serial?: number;
    time?: string;
    nextSerial?: number;
    user?: string;
    deleted?: boolean;
    comments?: string;
}

export interface Document extends Version {
    id: string;
}

export interface Query {
    start?: number;
    limit?: number;
    sort?: string;
    order?: "asc" | "desc";
}

export interface DocumentList extends Query {
    hitCount?: number;
    items: Document[];
}

export abstract class Database {
    public options: Options;

    constructor(options: Options) {
        options.summaryFields = options.summaryFields || ["id"];
        options.inMemory = !!options.inMemory;
        options.keepHistory = !!options.keepHistory;
        this.options = options;
    }

    abstract connect(): Promise<void>;

    abstract all(query?: Query): Promise<DocumentList>;

    abstract create(document: Document): Promise<Document>;

    abstract read(document: Document): Promise<Document>;

    abstract update(document: Document): Promise<Document>;

    abstract delete(document: Document): Promise<void>;

    abstract check(): Promise<any>;
}
