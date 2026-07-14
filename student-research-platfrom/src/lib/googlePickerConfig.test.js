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
    googleApiKey: 'AIzaSyDExampleKey12345678901234567890',
    googleClientId: '1234567890-example.apps.googleusercontent.com',
  });

  assert.equal(error, null);
});
