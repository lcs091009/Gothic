import test from 'node:test';
import assert from 'node:assert/strict';
import { getFriendlySupabaseError, isRetryableSupabaseError } from './supabaseClient.js';

test('retryable errors include network and 5xx issues', () => {
  assert.equal(isRetryableSupabaseError(new Error('Failed to fetch')), true);
  assert.equal(isRetryableSupabaseError({ status: 500, message: 'server error' }), true);
  assert.equal(isRetryableSupabaseError({ status: 400, message: 'bad request' }), false);
});

test('friendly errors return user-safe messages', () => {
  assert.match(getFriendlySupabaseError(new Error('Failed to fetch')), /잠시 후 다시/i);
  assert.match(getFriendlySupabaseError({ status: 500, message: 'server error' }), /잠시 후 다시/i);
  assert.match(getFriendlySupabaseError({ message: 'duplicate key' }), /중복/i);
});
