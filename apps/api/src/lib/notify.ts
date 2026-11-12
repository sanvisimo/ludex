const TIMEOUT_MS = 10_000;

/**
 * Un messaggio all'admin, sul bot Telegram degli errori di deploy e backup.
 *
 * Senza `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID` non fa niente: in sviluppo resta
 * muta. **Non lancia mai**: chi avvisa sta facendo un altro lavoro (un import),
 * e un avviso non partito non lo deve far fallire. Resta una riga nel log.
 */
export async function notifyAdmin(text: string): Promise<void> {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.log(`[notify] Telegram: ${response.status}`);
    }
  } catch (error) {
    console.log(`[notify] Telegram: ${String(error)}`);
  }
}
