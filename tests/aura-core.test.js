const test = require('node:test');
const assert = require('node:assert/strict');
const { roomVibe, SpeakerTracker, moonPhase, cosmicContext, mapStructures } = require('../aura-core.js');

test('room vibe is independent of absolute volume', () => {
  const acoustic = {
    harmonicity: 0.72,
    spectralBalance: 0.68,
    spectralFlux: 0.76,
    rhythmVitality: 0.81,
    pitchExpression: 0.64,
    socialEnergy: 0.70
  };
  const quiet = roomVibe({ ...acoustic, rms: 0.02 });
  const loud = roomVibe({ ...acoustic, rms: 0.90 });
  assert.equal(quiet, loud);
});

test('energetic harmonic sound can score as a good vibe', () => {
  const score = roomVibe({
    harmonicity: 0.80,
    spectralBalance: 0.76,
    spectralFlux: 0.88,
    rhythmVitality: 0.90,
    pitchExpression: 0.78,
    socialEnergy: 0.92,
    rms: 0.95
  });
  assert.ok(score > 0.72, `expected a positive party-like vibe, got ${score}`);
});

test('similar voice signatures keep the same anonymous person label', () => {
  const tracker = new SpeakerTracker();
  const a = tracker.observe({ pitch: 150, centroid: 1100, harmonicity: 0.74 }, 0.78, 1000);
  const b = tracker.observe({ pitch: 156, centroid: 1160, harmonicity: 0.71 }, 0.82, 2000);
  assert.equal(a.id, b.id);
  assert.equal(b.label, 'Person 1');
});

test('octave pitch tracking jumps stay with the same person', () => {
  const tracker = new SpeakerTracker({ newSpeakerEvidence: 2 });
  tracker.observe({ pitch: 150, centroid: 1100, harmonicity: 0.74 }, 0.7, 1000);
  tracker.observe({ pitch: 298, centroid: 1130, harmonicity: 0.72 }, 0.71, 2000);
  const octaveJump = tracker.observe({ pitch: 302, centroid: 1150, harmonicity: 0.73 }, 0.72, 3000);
  assert.equal(octaveJump.label, 'Person 1');
  assert.equal(tracker.people.length, 1);
});

test('speaker warmup prevents startup calibration noise from creating labels', () => {
  const tracker = new SpeakerTracker({ newSpeakerEvidence: 2, warmupMs: 5000 });
  tracker.observe({ pitch: 130, centroid: 900, harmonicity: 0.75 }, 0.7, 1000);
  tracker.observe({ pitch: 245, centroid: 2400, harmonicity: 0.55 }, 0.6, 2000);
  const startupNoise = tracker.observe({ pitch: 242, centroid: 2350, harmonicity: 0.56 }, 0.62, 3000);
  assert.equal(startupNoise.label, 'Person 1');
  assert.equal(tracker.people.length, 1);
});

test('continuous acoustic drift does not invent another person without a voice gap', () => {
  const tracker = new SpeakerTracker({ newSpeakerEvidence: 2, requireGapMs: 1500 });
  tracker.observe({ pitch: 130, centroid: 900, harmonicity: 0.75 }, 0.7, 1000);
  tracker.observe({ pitch: 245, centroid: 2400, harmonicity: 0.55 }, 0.6, 1600);
  const drift = tracker.observe({ pitch: 242, centroid: 2350, harmonicity: 0.56 }, 0.62, 2200);
  assert.equal(drift.label, 'Person 1');
  assert.equal(tracker.people.length, 1);
});

test('distinct voice signatures create a new label only after repeated evidence', () => {
  const tracker = new SpeakerTracker({ newSpeakerEvidence: 2 });
  tracker.observe({ pitch: 128, centroid: 900, harmonicity: 0.78 }, 0.72, 1000);
  const transient = tracker.observe({ pitch: 248, centroid: 2400, harmonicity: 0.55 }, 0.64, 2000);
  const confirmed = tracker.observe({ pitch: 244, centroid: 2320, harmonicity: 0.57 }, 0.66, 3000);
  assert.equal(transient.label, 'Person 1');
  assert.equal(confirmed.label, 'Person 2');
});

test('person observations keep a bounded local vibe history', () => {
  const tracker = new SpeakerTracker({ historyLimit: 3 });
  for (let i = 0; i < 5; i++) {
    tracker.observe({ pitch: 170, centroid: 1300, harmonicity: 0.7 }, 0.5 + i * 0.05, i * 1000);
  }
  assert.equal(tracker.people[0].history.length, 3);
  assert.equal(tracker.people[0].history.at(-1).vibe, 0.7);
});

test('moon phase identifies the April 2024 new moon', () => {
  const moon = moonPhase(new Date('2024-04-08T18:00:00Z'));
  assert.equal(moon.name, 'new moon');
  assert.ok(moon.illumination < 0.02, `expected near-zero illumination, got ${moon.illumination}`);
});

test('cosmic context contains location-oriented moon and planet data', () => {
  const sky = cosmicContext(34.05, -118.24, new Date('2026-07-27T20:00:00Z'));
  assert.equal(sky.latitude, 34.05);
  assert.equal(sky.longitude, -118.24);
  assert.ok(sky.siderealDegrees >= 0 && sky.siderealDegrees < 360);
  assert.ok(sky.planets.length >= 5);
  assert.ok(sky.planets.every(p => p.longitude >= 0 && p.longitude < 360 && p.symbol));
  assert.ok(sky.moon.name);
});

test('map structures turn OpenStreetMap geometry into local buildings and roads', () => {
  const data = mapStructures([
    { type:'way', tags:{building:'yes', name:'Aura House', 'building:levels':'3'}, geometry:[
      {lat:34.0500,lon:-118.2400},{lat:34.0500,lon:-118.2399},{lat:34.0501,lon:-118.2399},{lat:34.0500,lon:-118.2400}
    ]},
    { type:'way', tags:{highway:'residential', name:'Glow Street'}, geometry:[
      {lat:34.0499,lon:-118.2402},{lat:34.0502,lon:-118.2398}
    ]}
  ], 34.05, -118.24);
  assert.equal(data.buildings.length, 1);
  assert.equal(data.buildings[0].name, 'Aura House');
  assert.equal(data.buildings[0].levels, 3);
  assert.equal(data.roads.length, 1);
  assert.equal(data.roads[0].kind, 'residential');
  assert.equal(data.roads[0].name, 'Glow Street');
  assert.ok(data.buildings[0].points[1].x > 0);
});
