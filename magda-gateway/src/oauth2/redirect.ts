import { Request, Response } from 'express';
import { URL } from 'url'

export function redirectOnSuccess(toURL: string, req: Request, res: Response) {
    const source = new URL(toURL);
    source.searchParams.set('result', 'success');
    source.searchParams.delete('errorMessage');
    res.redirect(<string>source.href);
}

export function redirectOnError(err: any, toURL: string, req: Request, res: Response) {
    const source = new URL(toURL);
    source.searchParams.set('result', 'failure');
    source.searchParams.set('errorMessage', err);
    res.redirect(<string>source.href);
}