import test from "node:test";
import assert from "node:assert/strict";
import { googleLoginOptions, googleLoginError, googleCallbackError } from "./googleLogin.js";

test("login uses Google account selection without requesting Drive access", () => {
  const args = googleLoginOptions("https://example.com");
  assert.equal(args.provider, "google");
  assert.equal(args.options.redirectTo, "https://example.com");
  assert.equal(args.options.queryParams.prompt, "select_account");
  assert.equal(args.options.scopes, undefined);
});
test("OAuth failures use safe guidance rather than provider details", () => {
  assert.match(googleLoginError({ code: "provider_disabled" }), /설정/);
  assert.match(googleCallbackError({ hash: "#error=access_denied&error_description=private-data", search: "" }), /학교/);
  assert.match(googleCallbackError({ hash: "", search: "?error=server_error&error_description=private-data" }), /다시/);
  assert.equal(googleCallbackError({ hash: "#access_token=secret", search: "" }), "");
  assert.doesNotMatch(googleLoginError({ message: "private-data" }), /private-data/);
});
