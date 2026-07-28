import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('page loads the tested acoustic analysis core', () => {
  assert.match(html, /<script src="aura-core\.js(?:\?[^\"]+)?"><\/script>/);
  assert.match(html, /AuraCore\.roomVibe/);
});

test('page exposes anonymous people and celestial field panels', () => {
  assert.match(html, /id="peoplePanel"/);
  assert.match(html, /id="cosmicChip"/);
  assert.match(html, /field \+ sky map/i);
});

test('page loads and beautifully draws real local buildings and roads', () => {
  assert.match(html, /loadStructures/);
  assert.match(html, /AuraCore\.mapStructures/);
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /id="mapSource"/);
});

test('page does not transcribe words or score absolute loudness', () => {
  assert.doesNotMatch(html, /SpeechRecognition|webkitSpeechRecognition|transcript/i);
  assert.doesNotMatch(html, /loudScore|vEase/);
});
