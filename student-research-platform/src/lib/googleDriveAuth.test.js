import test from "node:test";
import assert from "node:assert/strict";
import { requestDriveAccessToken, AUTH_TIMEOUT_MS, DRIVE_SCOPE } from "./googleDriveAuth.js";

function fixture(signal) {
  let config, request, now = 0;
  const timers = new Map();
  let nextId = 0;
  const promise = requestDriveAccessToken({
    clientId: "test.apps.googleusercontent.com", signal,
    oauth2: { initTokenClient(c) { config = c; return { requestAccessToken(r) { request = r; } }; } },
    setTimer(fn, ms) { const id = ++nextId; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  return { promise, get config() { return config; }, get request() { return request; }, timers,
    advance(ms) { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } } };
}

test("allows time for first consent and does not time out after eight seconds", async () => {
  const f = fixture();
  f.advance(9000);
  assert.equal(f.timers.size, 1);
  f.advance(81000);
  f.config.callback({ access_token: "test-token", expires_in: 3600 });
  assert.equal((await f.promise).access_token, "test-token");
  assert.equal(f.timers.size, 0);
  assert.equal(f.config.scope, DRIVE_SCOPE);
  assert.equal(f.config.include_granted_scopes, false);
  assert.equal(f.request.prompt, "");
});

test("Google popup close and popup block produce distinct errors", async () => {
  for (const [type, expected] of [["popup_closed", /창이 닫혔습니다/], ["popup_failed_to_open", /팝업이 차단/]]) {
    const f = fixture();
    const result = assert.rejects(f.promise, expected);
    f.config.error_callback({ type });
    await result;
    assert.equal(f.timers.size, 0);
  }
});

test("late popup errors cannot overwrite a successful token response", async () => {
  const f = fixture();
  f.config.callback({ access_token: "test-token" });
  f.config.error_callback({ type: "popup_closed" });
  assert.equal((await f.promise).access_token, "test-token");
});

test("permission refusal and missing tokens reject without exposing provider details", async () => {
  for (const response of [{ error: "access_denied", error_description: "PRIVATE_DETAIL" }, {}]) {
    const f = fixture();
    const result = assert.rejects(f.promise, error => !error.message.includes("PRIVATE_DETAIL"));
    f.config.callback(response);
    await result;
    assert.equal(f.timers.size, 0);
  }
});

test("timeout rejects late callbacks and clears the wait", async () => {
  const f = fixture();
  const result = assert.rejects(f.promise, /시간이 초과/);
  f.advance(AUTH_TIMEOUT_MS);
  f.config.callback({ access_token: "late-token" });
  await result;
  assert.equal(f.timers.size, 0);
});

test("account change cancels pending approval so a late token cannot cross accounts", async () => {
  const controller = new AbortController();
  const f = fixture(controller.signal);
  const result = assert.rejects(f.promise, /계정이 변경/);
  controller.abort();
  f.config.callback({ access_token: "old-account-token" });
  await result;
  assert.equal(f.timers.size, 0);
});
