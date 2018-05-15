import * as nodemailer from "nodemailer";
import * as SMTPTransport from "nodemailer/lib/smtp-transport";

export interface SMTPMailer {
    send(msg: Message): Promise<{}>;
    checkConnectivity(): Promise<void>;
}

export interface SMTPMailerOptions {
    smtpHostname: string;
    smtpUsername?: string;
    smtpPassword?: string;
    smtpPort: number;
    smtpSecure: boolean;
}

export interface Message {
    to: string;
    from: string;
    replyTo: string;
    subject: string;
    text: string;
    html: string;
    attachments: Array<{
        filename: string;
        contentType: string;
        contentDisposition: string;
        path: string;
        cid: string;
    }>;
}

export class NodeMailerSMTPMailer implements SMTPMailer {
    constructor(readonly opts: SMTPMailerOptions) {}

    private connect(): Promise<nodemailer.Transporter> {
        const options: SMTPTransport.Options = {
            host: this.opts.smtpHostname,
            port: this.opts.smtpPort,
            secure: this.opts.smtpSecure,
            logger: false,
            debug: false,
            connectionTimeout: 1500,
            auth: {
                user: this.opts.smtpUsername,
                pass: this.opts.smtpPassword
            }
        };

        console.debug(`Creating SMTP Transport object with given args...`);
        const transporter = nodemailer.createTransport(options);

        return new Promise((resolve, reject) => {
            transporter.verify((err, success) => {
                console.debug(`...Verifying SMTP Transport connection...`);
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    console.debug(`...Connection established!`);
                    resolve(transporter);
                }
            });
        });
    }

    checkConnectivity() {
        return this.connect().then(transporter => {
            transporter.close();
        });
    }

    send(msg: Message) {
        return this.connect().then(
            transporter =>
                new Promise((resolve, reject) => {
                    transporter.sendMail(msg, (err, info) => {
                        if (err) {
                            console.error(err);
                            transporter.close();
                            throw err;
                        } else {
                            console.debug(`Mail sent!`);
                            console.debug(
                                `Attempting to close SMTP transporter connection...`
                            );
                            transporter.close();
                            console.debug(
                                `...Closed SMTP transporter connection. \n Success!!!`
                            );
                            return info;
                        }
                    });
                })
        );
    }
}
