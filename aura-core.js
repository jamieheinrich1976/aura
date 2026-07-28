(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AuraCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

  function roomVibe(features = {}) {
    const harmonicity = clamp01(features.harmonicity);
    const spectralBalance = clamp01(features.spectralBalance);
    const spectralFlux = clamp01(features.spectralFlux);
    const rhythmVitality = clamp01(features.rhythmVitality);
    const pitchExpression = clamp01(features.pitchExpression);
    const socialEnergy = clamp01(features.socialEnergy);

    // Absolute amplitude is intentionally excluded. Loud parties and quiet rooms
    // are judged by normalized acoustic shape, rhythm and harmonic/prosodic motion.
    return clamp01(
      harmonicity * 0.22 +
      spectralBalance * 0.18 +
      spectralFlux * 0.20 +
      rhythmVitality * 0.20 +
      pitchExpression * 0.12 +
      socialEnergy * 0.08
    );
  }

  function normalizeDegrees(value) {
    return ((value % 360) + 360) % 360;
  }

  function moonPhase(date = new Date()) {
    const cycleDays = 29.530588853;
    const knownNewMoon = Date.parse('2000-01-06T18:14:00Z');
    const days = (date.getTime() - knownNewMoon) / 86400000;
    const phase = ((days / cycleDays) % 1 + 1) % 1;
    const illumination = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    const names = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
    const index = Math.floor(phase * 8 + 0.5) % 8;
    return { phase, illumination, ageDays: phase * cycleDays, name: names[index] };
  }

  function cosmicContext(latitude = 0, longitude = 0, date = new Date()) {
    const julianDate = date.getTime() / 86400000 + 2440587.5;
    const daysSinceJ2000 = julianDate - 2451545.0;
    const siderealDegrees = normalizeDegrees(
      280.46061837 + 360.98564736629 * daysSinceJ2000 + longitude
    );
    const orbits = [
      ['Mercury', '☿', 87.969, 252.25],
      ['Venus', '♀', 224.701, 181.98],
      ['Mars', '♂', 686.980, 355.43],
      ['Jupiter', '♃', 4332.59, 34.35],
      ['Saturn', '♄', 10759.22, 50.08]
    ];
    const planets = orbits.map(([name, symbol, period, longitudeAtJ2000]) => ({
      name,
      symbol,
      longitude: normalizeDegrees(longitudeAtJ2000 + daysSinceJ2000 * 360 / period)
    }));
    return {
      latitude,
      longitude,
      timestamp: date.toISOString(),
      siderealDegrees,
      moon: moonPhase(date),
      planets,
      approximate: true
    };
  }

  function geoToLocal(latitude, longitude, originLatitude, originLongitude) {
    const x = (longitude - originLongitude) * 111320 * Math.cos(originLatitude * Math.PI / 180);
    const y = -(latitude - originLatitude) * 110540;
    return { x, y };
  }

  function mapStructures(elements = [], originLatitude = 0, originLongitude = 0) {
    const buildings = [];
    const roads = [];
    for (const element of elements) {
      if (element.type !== 'way' || !Array.isArray(element.geometry)) continue;
      const points = element.geometry
        .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))
        .map(point => geoToLocal(point.lat, point.lon, originLatitude, originLongitude));
      const tags = element.tags || {};
      if ((tags.building || tags['building:part']) && points.length >= 3) {
        buildings.push({
          points,
          name: tags.name || '',
          kind: tags.building || tags['building:part'] || 'yes',
          levels: Math.max(1, parseInt(tags['building:levels'] || '1', 10) || 1)
        });
      } else if (tags.highway && points.length >= 2) {
        roads.push({ points, name: tags.name || '', kind: tags.highway });
      }
    }
    return { buildings, roads };
  }

  class SpeakerTracker {
    constructor(options = {}) {
      this.people = [];
      this.maxPeople = options.maxPeople || 5;
      this.historyLimit = options.historyLimit || 40;
      this.matchThreshold = options.matchThreshold || 0.32;
      this.newSpeakerEvidence = options.newSpeakerEvidence || 3;
      this.warmupMs = options.warmupMs ?? 0;
      this.requireGapMs = options.requireGapMs ?? 0;
      this.lastObservation = null;
      this.newSpeakerWindowUntil = 0;
      this.pendingSpeaker = null;
    }

    signatureDistance(a, b) {
      const rawPitchDistance = Math.abs(Math.log2(Math.max(a.pitch, 1) / Math.max(b.pitch, 1)));
      // Autocorrelation commonly jumps by an octave for the same voice.
      const pitch = Math.min(rawPitchDistance, Math.abs(rawPitchDistance - Math.round(rawPitchDistance)));
      const centroid = Math.abs(Math.log2(Math.max(a.centroid, 80) / Math.max(b.centroid, 80)));
      const harmonicity = Math.abs(clamp01(a.harmonicity) - clamp01(b.harmonicity));
      return pitch * 0.55 + centroid * 0.30 + harmonicity * 0.15;
    }

    observe(signature, vibe, timestamp = Date.now()) {
      if (this.lastObservation !== null && this.requireGapMs > 0 && timestamp - this.lastObservation > this.requireGapMs) {
        this.newSpeakerWindowUntil = timestamp + 3000;
      }
      this.lastObservation = timestamp;
      const normalized = {
        pitch: Math.max(1, signature.pitch || 1),
        centroid: Math.max(80, signature.centroid || 80),
        harmonicity: clamp01(signature.harmonicity)
      };
      let person = null;
      let distance = Infinity;
      for (const candidate of this.people) {
        const d = this.signatureDistance(normalized, candidate.signature);
        if (d < distance) { distance = d; person = candidate; }
      }
      let created = false;
      let transient = false;
      if (!person) {
        person = {
          id: this.people.length + 1,
          label: `Person ${this.people.length + 1}`,
          signature: { ...normalized },
          vibe: clamp01(vibe),
          createdAt: timestamp,
          lastSeen: timestamp,
          history: []
        };
        this.people.push(person);
        created = true;
      } else if (this.people.length === 1 && timestamp - person.createdAt < this.warmupMs) {
        this.pendingSpeaker = null;
        transient = true;
      } else if (distance > this.matchThreshold && this.people.length < this.maxPeople) {
        if (this.requireGapMs > 0 && timestamp > this.newSpeakerWindowUntil) {
          this.pendingSpeaker = null;
          return person;
        }
        const samePending = this.pendingSpeaker && this.signatureDistance(normalized, this.pendingSpeaker.signature) <= this.matchThreshold;
        if (samePending) {
          this.pendingSpeaker.count += 1;
          this.pendingSpeaker.signature.pitch += (normalized.pitch - this.pendingSpeaker.signature.pitch) * 0.25;
          this.pendingSpeaker.signature.centroid += (normalized.centroid - this.pendingSpeaker.signature.centroid) * 0.25;
          this.pendingSpeaker.signature.harmonicity += (normalized.harmonicity - this.pendingSpeaker.signature.harmonicity) * 0.25;
          this.pendingSpeaker.vibe = clamp01(vibe);
        } else {
          this.pendingSpeaker = { signature: { ...normalized }, vibe: clamp01(vibe), count: 1 };
        }
        if (this.pendingSpeaker.count >= this.newSpeakerEvidence) {
          person = {
            id: this.people.length + 1,
            label: `Person ${this.people.length + 1}`,
            signature: { ...this.pendingSpeaker.signature },
            vibe: this.pendingSpeaker.vibe,
            createdAt: timestamp,
            lastSeen: timestamp,
            history: []
          };
          this.people.push(person);
          this.pendingSpeaker = null;
          created = true;
        } else {
          transient = true;
        }
      } else {
        this.pendingSpeaker = null;
      }
      if (!created && !transient) {
        const blend = 0.12;
        person.signature.pitch += (normalized.pitch - person.signature.pitch) * blend;
        person.signature.centroid += (normalized.centroid - person.signature.centroid) * blend;
        person.signature.harmonicity += (normalized.harmonicity - person.signature.harmonicity) * blend;
        person.vibe += (clamp01(vibe) - person.vibe) * 0.22;
        person.lastSeen = timestamp;
      }
      if (transient) return person;
      person.history.push({ timestamp, vibe: clamp01(vibe) });
      if (person.history.length > this.historyLimit) person.history.splice(0, person.history.length - this.historyLimit);
      return person;
    }
  }

  return { clamp01, roomVibe, SpeakerTracker, moonPhase, cosmicContext, normalizeDegrees, geoToLocal, mapStructures };
});
