// Build APK Android dari CLI tanpa Android Studio.
// Jalankan: npm run android:build
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = path.join(ROOT, 'apps', 'web', 'android');
const APK_DIR = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk');
const OUT_DIR = path.join(ROOT, 'dist', 'android');
const isWindows = process.platform === 'win32';

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function resolveJdk() {
  const candidates = [process.env.JAVA_HOME];
  if (isWindows) {
    const base = 'C:\\Program Files\\Eclipse Adoptium';
    if (fs.existsSync(base)) {
      for (const entry of fs.readdirSync(base)) candidates.push(path.join(base, entry));
    }
    for (const entry of ['C:\\Program Files\\Java', 'C:\\Program Files\\Microsoft']) {
      if (!fs.existsSync(entry)) continue;
      for (const child of fs.readdirSync(entry)) candidates.push(path.join(entry, child));
    }
  } else {
    candidates.push('/usr/lib/jvm/default-java');
  }
  const jdk = firstExisting(candidates);
  if (!jdk) {
    throw new Error('JDK 21 tidak ditemukan. Set JAVA_HOME ke folder JDK.');
  }
  return jdk;
}

function resolveSdk() {
  const home = os.homedir();
  const sdk = firstExisting([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWindows ? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : path.join(home, 'Android', 'Sdk'),
    isWindows ? path.join(home, 'AppData', 'Local', 'Android', 'Sdk') : null
  ]);
  if (!sdk) {
    throw new Error('Android SDK tidak ditemukan. Set ANDROID_HOME ke folder SDK.');
  }
  return sdk;
}

const jdk = resolveJdk();
const sdk = resolveSdk();
const javaBin = path.join(jdk, 'bin');

const localProperties = path.join(ANDROID_DIR, 'local.properties');
const sdkDir = sdk.replace(/\\/g, '/');
if (!fs.existsSync(localProperties) || !fs.readFileSync(localProperties, 'utf8').includes(sdkDir)) {
  fs.writeFileSync(localProperties, `sdk.dir=${sdkDir}\n`, 'ascii');
}

const gradle = isWindows ? 'gradlew.bat' : './gradlew';
const args = ['assembleDebug', 'assembleRelease', '--no-daemon', '--console=plain'];

console.log(`JDK       : ${jdk}`);
console.log(`Android SDK: ${sdk}`);
console.log(`Gradle    : ${gradle} ${args.join(' ')}\n`);

const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : gradle;
const commandArgs = isWindows
  ? ['/d', '/s', '/c', `gradlew.bat ${args.join(' ')}`]
  : args;

const result = spawnSync(command, commandArgs, {
  cwd: ANDROID_DIR,
  stdio: 'inherit',
  env: {
    ...process.env,
    JAVA_HOME: jdk,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    PATH: `${javaBin}${path.delimiter}${path.join(sdk, 'platform-tools')}${path.delimiter}${process.env.PATH ?? ''}`
  }
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const artifacts = [
  ['release', ['app-release.apk', 'app-release-unsigned.apk'], 'ToolsApps-0.1.0-release.apk'],
  ['debug', ['app-debug.apk'], 'ToolsApps-0.1.0-debug.apk']
];

for (const [type, candidates, output] of artifacts) {
  const source = candidates
    .map((name) => path.join(APK_DIR, type, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!source) {
    throw new Error(`APK ${type} tidak ditemukan di ${path.join(APK_DIR, type)}`);
  }
  const signed = !source.endsWith('-unsigned.apk');
  const target = signed ? output : output.replace('.apk', '-unsigned.apk');
  fs.copyFileSync(source, path.join(OUT_DIR, target));
  const size = (fs.statSync(source).size / 1024 / 1024).toFixed(1);
  console.log(`\nAPK ${type}: ${path.relative(ROOT, path.join(OUT_DIR, target))} (${size} MB)`);
  if (!signed) console.log('  Catatan: APK rilis tidak bertanda tangan. Lihat README bagian penandatanganan.');
}

console.log('\nSelesai. Pasang APK rilis ke perangkat Android yang mengizinkan sumber tidak dikenal.');
