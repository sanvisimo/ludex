import { spawnSync } from 'node:child_process';
import process from 'node:process';

// Nell'emulatore `localhost` è il telefono: `adb reverse` gli porta la porta
// del sito, che l'app apre su `localhost` perché è l'origine di cui si fida il
// server. Sotto WSL adb è quello di Windows, `adb.exe`. Senza adb o senza un
// dispositivo collegato non si ferma niente: si avvisa e Metro parte lo stesso.
const port = new URL(process.env.EXPO_PUBLIC_WEB_URL || 'http://localhost:8085')
  .port;

const done = ['adb', 'adb.exe'].some(
  (adb) =>
    spawnSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], {
      stdio: 'ignore',
    }).status === 0,
);

console.log(
  done
    ? `adb reverse tcp:${port}: il sito è raggiungibile dall'emulatore`
    : `adb reverse non riuscito (adb assente o nessun dispositivo): lancialo a mano dopo aver avviato l'emulatore`,
);
