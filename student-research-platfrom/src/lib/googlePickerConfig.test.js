import test from 'node:test';
import assert from 'node:assert/strict';

import { getGooglePickerConfigError } from './googlePickerConfig.js';

test('returns helpful error when Google API key is missing', () => {
  const error = getGooglePickerConfigError({ googleApiKey: '', googleClientId: 'demo.apps.googleusercontent.com' });

  assert.match(error, /VITE_GOOGLE_API_KEY/);
});

test('returns helpful error when Google API key format is invalid', () => {
  const error = getGooglePickerConfigError({ googleApiKey: 'not-a-real-key', googleClientId: 'demo.apps.googleusercontent.com' });

  assert.match(error, /Google Cloud Console/);
});

test('returns null for a plausible key and client id', () => {
  const error = getGooglePickerConfigError({
    googleApiKey: 'AIza' + 'a'.repeat(35),
    googleClientId: '1234567890-example.apps.googleusercontent.com',
    googleAppId: '1234567890',
  });

  assert.equal(error, null);
});

test('rejects missing project number, project names and OAuth client IDs used as Picker App ID', () => {
  for (const googleAppId of ['', 'school-project', '1234567890-example.apps.googleusercontent.com']) {
    const error = getGooglePickerConfigError({ googleApiKey: 'AIza' + 'a'.repeat(35),
      googleClientId: '1234567890-example.apps.googleusercontent.com', googleAppId });
    assert.match(error, /숫자 프로젝트 번호/);
  }
});
