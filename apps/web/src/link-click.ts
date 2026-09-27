/**
 * Il clic su un `<a href>` che la navigazione dell'app deve prendersi.
 *
 * Un clic semplice resta nell'app; con un modificatore (nuova scheda, nuova
 * finestra) o col tasto centrale decide il browser, come farebbe il `Link`
 * del router. Restituisce `true` quando il clic è dell'app, e in quel caso ha
 * già fermato la navigazione del browser.
 *
 * Tamagui tipizza l'evento come quello di React Native, ma sul web è il clic
 * del DOM: `preventDefault` e i modificatori ci sono davvero.
 */
export function takeLinkClick(raw: unknown) {
  const event = raw as React.MouseEvent<HTMLAnchorElement>;
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }
  event.preventDefault();
  return true;
}
