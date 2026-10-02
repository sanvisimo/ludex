/**
 * Browser e sistema operativo, ricavati dallo user agent di una sessione.
 *
 * Serve a una cosa sola: riconoscere i propri dispositivi nell'elenco delle
 * sessioni («Chrome · Windows», «Safari · iPhone»). Non è un parser: un UA che
 * non si riconosce dà `null` e la riga dice «dispositivo sconosciuto», che è
 * meglio di un nome sbagliato. L'ordine dei controlli conta, perché gli UA si
 * citano a vicenda: Edge e Opera contengono «Chrome», e Chrome contiene
 * «Safari».
 */
export function describeUserAgent(userAgent: string | null | undefined): {
  browser: string | null;
  os: string | null;
} {
  const ua = userAgent ?? '';

  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;

  // iPhone e iPad prima di macOS: il loro UA dice «like Mac OS X». Android
  // prima di Linux, per la stessa ragione.
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux|X11/.test(ua)
              ? 'Linux'
              : null;

  return { browser, os };
}
