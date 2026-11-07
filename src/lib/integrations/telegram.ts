import { z } from "zod";
import { digest } from "../domain/airlock";
import type { Ledger } from "../domain/types";
import { constantEqual } from "../security";

const LINK_MINUTES = 15;
const update = z.object({
  message: z
    .object({
      text: z.string().max(4096).optional(),
      chat: z.object({ id: z.number().int(), type: z.string() }),
    })
    .optional(),
});

export function telegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_USERNAME && process.env.TELEGRAM_WEBHOOK_SECRET,
  );
}
export function telegramUrl(code: string) {
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${code}`;
}
export function telegramSecretValid(supplied: string | null) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  return Boolean(secret) && constantEqual(supplied ?? "", secret!);
}
export function linkExpiry() {
  return new Date(Date.now() + LINK_MINUTES * 60000).toISOString();
}

const label = (state: string) => state.replaceAll("_", " ");

/** Applies one bot message to the ledger and returns the reply to send. */
export function applyTelegramUpdate(ledger: Ledger, body: unknown) {
  const message = update.parse(body).message;
  if (!message?.text || message.chat.type !== "private") return undefined;
  const chatId = message.chat.id;
  const [command, code] = message.text.trim().split(/\s+/);
  const linked = Object.values(ledger.reports).filter(
    (report) => report.telegram?.chatId === chatId,
  );
  let text =
    "I send updates about bugs you reported. Open your private tracking page and choose Connect Telegram.";
  if (command === "/start" && code) {
    const hash = digest(code);
    const report = Object.values(ledger.reports).find(
      (candidate) =>
        candidate.telegramLink &&
        constantEqual(candidate.telegramLink.codeHash, hash) &&
        Date.parse(candidate.telegramLink.expiresAt) > Date.now(),
    );
    if (!report)
      text =
        "That link has expired. Open your private tracking page and choose Connect Telegram again.";
    else {
      report.telegram = { chatId, linkedAt: new Date().toISOString() };
      delete report.telegramLink;
      const cluster = ledger.clusters[report.clusterId];
      text = `You will get updates for ${cluster.id} here. Status: ${label(cluster.state)}. Send /stop to turn them off.`;
    }
  } else if (command === "/status")
    text = linked.length
      ? linked
          .map((report) => {
            const cluster = ledger.clusters[report.clusterId];
            return `${cluster.id}: ${label(cluster.state)}`;
          })
          .join("\n")
      : "No reports are linked to this chat.";
  else if (command === "/stop") {
    linked.forEach((report) => delete report.telegram);
    text = "Updates are off. Your private tracking link still works.";
  }
  return { chatId, text };
}
