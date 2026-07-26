import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import capacitorConfig from './capacitor.config';

type PackageJson = {
  scripts?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as PackageJson;

const androidManifestPath = fileURLToPath(
  new URL('./android/app/src/main/AndroidManifest.xml', import.meta.url),
);
const iosInfoPlistPath = fileURLToPath(new URL('./ios/App/App/Info.plist', import.meta.url));

test('Capacitor config targets the Vite dist output', () => {
  assert.equal(capacitorConfig.appName, 'Barrier-Free Meetings');
  assert.equal(capacitorConfig.appId, 'com.transcribeeasy.app');
  assert.equal(capacitorConfig.webDir, 'dist');
});

test('package scripts include Capacitor mobile workflows', () => {
  assert.equal(packageJson.scripts?.['cap:copy'], 'npx cap copy');
  assert.equal(packageJson.scripts?.['cap:sync'], 'npx cap sync');
  assert.equal(packageJson.scripts?.['cap:open:android'], 'npx cap open android');
  assert.equal(packageJson.scripts?.['cap:open:ios'], 'npx cap open ios');
  assert.equal(packageJson.scripts?.['mobile:build'], 'npm run build && npx cap sync');
});

test(
  'native shells declare microphone permissions for mobile recording',
  { skip: !existsSync(androidManifestPath) || !existsSync(iosInfoPlistPath) },
  () => {
    // android/ and ios/ are generated locally via Capacitor and are not committed.
    const androidManifest = readFileSync(androidManifestPath, 'utf8');
    const iosInfoPlist = readFileSync(iosInfoPlistPath, 'utf8');
    assert.match(androidManifest, /android\.permission\.RECORD_AUDIO/);
    assert.match(iosInfoPlist, /NSMicrophoneUsageDescription/);
    assert.match(iosInfoPlist, /NSSpeechRecognitionUsageDescription/);
  },
);
