import nodemailer from "nodemailer";

export function mailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendContact({ name, email, message }) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  const to = process.env.SMTP_TO || user;
  await transporter.sendMail({
    from: { name: "robin-prause.de", address: user },
    to,
    replyTo: { name, address: email },
    subject: `Nachricht von ${name}`,
    text: `${name} <${email}>\n\n${message}\n`,
  });
}
