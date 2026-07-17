import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totp, verifyTotp, base32Encode, base32Decode, generateSecret } from '../src/lib/totp.js';

// RFC 6238 test vector (SHA-1, secret = ASCII "12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

test('TOTP matches RFC 6238 SHA-1 vectors (6-digit)', () => {
  // 8-digit RFC codes truncated to 6: 94287082→287082, 07081804→081804, 89005924→005924
  assert.equal(totp(RFC_SECRET, 59 * 1000), '287082');
  assert.equal(totp(RFC_SECRET, 1111111109 * 1000), '081804');
  assert.equal(totp(RFC_SECRET, 1234567890 * 1000), '005924');
});

test('base32 round-trips', () => {
  const buf = Buffer.from('hello world');
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
});

test('verifyTotp accepts current code and tolerates ±1 step, rejects wrong', () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  const real = totp(secret, now);
  assert.equal(verifyTotp(secret, real, now), true);
  assert.equal(verifyTotp(secret, totp(secret, now - 30_000), now), true); // previous step
  const wrong = real === '000000' ? '111111' : '000000';
  assert.equal(verifyTotp(secret, wrong, now), false);
  assert.equal(verifyTotp(secret, 'abc', now), false);
});
