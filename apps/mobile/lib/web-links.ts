import * as WebBrowser from 'expo-web-browser';

import { webUrl } from './env';

/** Le pagine che restano sul sito si aprono nel browser del telefono. */
export function openOnWeb(path: string) {
  void WebBrowser.openBrowserAsync(`${webUrl}${path}`);
}
