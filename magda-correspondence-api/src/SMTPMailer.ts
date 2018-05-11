import * as nodemailer from "nodemailer";

export interface SMTPMailer {
    send(msg: Message): Promise<{}>;
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

    send(msg: Message) {
        const options: any = {
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

        console.log(`Creating SMTP Transport object with given args...`);
        let transporter = nodemailer.createTransport(options);

        return new Promise((resolve, reject) => {
            transporter.verify((err, success) => {
                console.log(`...Verifying SMTP Transport connection...`);
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    console.log(
                        `...Connection established! \n Attempting to send mail...`
                    );
                    transporter.sendMail(msg, (err, info) => {
                        if (err) {
                            console.error(err);
                            transporter.close();
                            reject(err);
                        } else {
                            console.log(`Mail sent!`);
                            console.log(
                                `Attempting to close SMTP transporter connection...`
                            );
                            transporter.close();
                            resolve();
                            console.log(
                                `...Closed SMTP transporter connection. \n Success!!!`
                            );
                        }
                    });
                }
            });
        });
    }
}
