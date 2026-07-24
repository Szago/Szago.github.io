const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MASTER_GAIN = 0.58;
const SCHEDULER_LOOKAHEAD = 0.12;

// Exported from boss2d/motif-lab's "It Knows Your Name" preset. Layers are
// stored lead-first, while layerOrder preserves their intended entrance order:
// drums, bass, guitar, then lead.
export const IT_KNOWS_YOUR_NAME = Object.freeze({
  name: 'It Knows Your Name',
  bpm: 80,
  stepsPerBeat: 4,
  stepBeats: 0.25,
  length: 16,
  layerOrder: Object.freeze([4, 3, 2, 1]),
  layers: Object.freeze([
    Object.freeze({
      instrument: 'lead',
      volume: 0.72,
      notes: Object.freeze([
        'C#5', null, null, null, 'C5', null, null, 'G4',
        'C#5', null, null, null, null, 'D5', null, 'G#4'
      ]),
      accents: Object.freeze([
        true, false, false, false, false, false, false, false,
        true, false, false, false, false, false, false, true
      ]),
      holds: Object.freeze([4, 1, 1, 1, 2, 1, 1, 1, 4, 1, 1, 1, 1, 2, 1, 1]),
      variance: Object.freeze({
        cycleTranspose: 'rise',
        noteMutationChance: 0,
        mutationSemitones: 1,
        nonAccentDropout: 0
      })
    }),
    Object.freeze({
      instrument: 'guitar',
      volume: 0.58,
      notes: Object.freeze([
        'C#2', null, null, null, null, null, null, null,
        'C2', null, null, null, null, null, null, null
      ]),
      accents: Object.freeze([
        true, false, false, false, false, false, false, false,
        true, false, false, false, false, false, false, false
      ]),
      holds: Object.freeze([8, 1, 1, 1, 1, 1, 1, 1, 8, 1, 1, 1, 1, 1, 1, 1]),
      variance: Object.freeze({
        cycleTranspose: 'off',
        noteMutationChance: 0,
        mutationSemitones: 1,
        nonAccentDropout: 0
      })
    }),
    Object.freeze({
      instrument: 'bass',
      volume: 0.82,
      notes: Object.freeze([
        'C#2', null, null, 'C#2', null, null, null, null,
        'C2', null, null, 'B1', null, null, 'C#2', null
      ]),
      accents: Object.freeze([
        true, false, false, true, false, false, false, false,
        true, false, false, true, false, false, false, false
      ]),
      holds: Object.freeze([2, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1]),
      variance: Object.freeze({
        cycleTranspose: 'off',
        noteMutationChance: 0,
        mutationSemitones: 1,
        nonAccentDropout: 0
      })
    }),
    Object.freeze({
      instrument: 'drums',
      volume: 0.64,
      notes: Object.freeze([
        'KICK', null, null, 'KICK', null, null, null, 'OPEN_HAT',
        'KICK', null, null, 'KICK', null, null, null, 'SNARE'
      ]),
      accents: Object.freeze([
        true, false, false, true, false, false, false, false,
        true, false, false, true, false, false, false, true
      ]),
      holds: Object.freeze([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      variance: Object.freeze({
        cycleTranspose: 'off',
        noteMutationChance: 0,
        mutationSemitones: 1,
        nonAccentDropout: 0
      })
    })
  ]),
  synth: Object.freeze({
    voice: 'warblePulse',
    guitarVoice: 'doomStack',
    bassVoice: 'deepSub',
    drumsVoice: 'machine',
    gate: 0.8,
    transpose: 0,
    bitDepth: 4,
    drive: 0.15,
    cutoffHz: 2000,
    bass: 0,
    noise: 0.03,
    echo: 0.3,
    echoBeats: 0.75
  })
});

function makePulseWave(context, duty) {
  const harmonics = 64;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty);
    imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty));
  }
  return context.createPeriodicWave(real, imag, { disableNormalization: false });
}

function makeCrusherCurve(bits) {
  const size = 65536;
  const curve = new Float32Array(size);
  const levels = Math.pow(2, bits - 1);
  for (let i = 0; i < size; i++) {
    const sample = i / (size - 1) * 2 - 1;
    curve[i] = Math.round(sample * levels) / levels;
  }
  return curve;
}

function makeDriveCurve(amount) {
  const size = 32768;
  const curve = new Float32Array(size);
  const driveAmount = 1 + amount * 75;
  for (let i = 0; i < size; i++) {
    const sample = i / (size - 1) * 2 - 1;
    curve[i] = ((1 + driveAmount) * sample) / (1 + driveAmount * Math.abs(sample));
  }
  return curve;
}

function noteToMidi(note) {
  const match = /^([A-G])(#?)(\d)$/.exec(note || '');
  if (!match) return null;
  const pitch = NOTE_NAMES.indexOf(match[1] + match[2]);
  return (Number(match[3]) + 1) * 12 + pitch;
}

function cycleTransposeOffset(mode, cycle) {
  const patterns = {
    off: [0],
    uneasy: [0, 1, 0, -1],
    rise: [0, 1, 2, 3],
    menace: [0, 1, 3, 1],
    sink: [0, -1, -2, -1],
    octave: [0, 0, 12, 0]
  };
  const pattern = patterns[mode] || patterns.off;
  return pattern[cycle % pattern.length];
}

function setAudioParam(param, value, time, transitionSeconds) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
  } else {
    const currentValue = param.value;
    param.cancelScheduledValues(time);
    param.setValueAtTime(currentValue, time);
  }
  if (transitionSeconds > 0) {
    param.linearRampToValueAtTime(value, time + transitionSeconds);
  } else {
    param.setValueAtTime(value, time);
  }
}

export function createItKnowsYourNamePlayer() {
  let audio = null;
  let schedulerTimer = 0;
  let playing = false;
  let currentStep = 0;
  let cycleIndex = 0;
  let nextNoteTime = 0;
  let activeLayerCount = 0;

  function createAudio() {
    if (audio) return audio;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    let context;
    try {
      context = new AudioContext();
    } catch (error) {
      console.warn('Unable to start world music:', error);
      return null;
    }

    const input = context.createGain();
    const crusher = context.createWaveShaper();
    const drive = context.createWaveShaper();
    const filter = context.createBiquadFilter();
    const dry = context.createGain();
    const delay = context.createDelay(2);
    const feedback = context.createGain();
    const wet = context.createGain();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const trackGains = IT_KNOWS_YOUR_NAME.layers.map(() => context.createGain());

    crusher.curve = makeCrusherCurve(IT_KNOWS_YOUR_NAME.synth.bitDepth);
    crusher.oversample = 'none';
    drive.curve = makeDriveCurve(IT_KNOWS_YOUR_NAME.synth.drive);
    drive.oversample = 'none';
    filter.type = 'lowpass';
    filter.frequency.value = IT_KNOWS_YOUR_NAME.synth.cutoffHz;
    filter.Q.value = 1.2;
    dry.gain.value = 1;
    delay.delayTime.value = (60 / IT_KNOWS_YOUR_NAME.bpm) * IT_KNOWS_YOUR_NAME.synth.echoBeats;
    wet.gain.value = IT_KNOWS_YOUR_NAME.synth.echo * 0.9;
    feedback.gain.value = Math.min(0.6, IT_KNOWS_YOUR_NAME.synth.echo * 1.05);
    master.gain.value = 0.0001;
    compressor.threshold.value = -15;
    compressor.knee.value = 4;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;

    trackGains.forEach((gain) => {
      gain.gain.value = 0;
      gain.connect(input);
    });
    input.connect(crusher).connect(drive).connect(filter);
    filter.connect(dry).connect(master);
    filter.connect(delay).connect(wet).connect(master);
    delay.connect(feedback).connect(delay);
    master.connect(compressor).connect(context.destination);

    audio = {
      context,
      master,
      trackGains,
      waves: {
        pulse12: makePulseWave(context, 0.125),
        pulse18: makePulseWave(context, 0.1875)
      }
    };
    return audio;
  }

  function scheduleOscillator(destination, voice, frequency, time, duration, amount, options = {}) {
    const context = audio.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    if (audio.waves[voice]) oscillator.setPeriodicWave(audio.waves[voice]);
    else oscillator.type = voice;
    oscillator.frequency.setValueAtTime(frequency * 1.012, time);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency,
      time + Math.min(0.025, duration * 0.2)
    );
    if (options.wobble) {
      const curve = new Float32Array(32);
      for (let i = 0; i < curve.length; i++) {
        curve[i] = (options.detune || 0) +
          Math.sin(i / (curve.length - 1) * Math.PI * 8) * options.wobble;
      }
      oscillator.detune.setValueCurveAtTime(curve, time, duration);
    } else {
      oscillator.detune.setValueAtTime(options.detune || 0, time);
    }
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(amount, time + 0.004);
    envelope.gain.setValueAtTime(amount, Math.max(time + 0.005, time + duration * 0.64));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  function scheduleFilteredNoise(destination, time, duration, amount, type, frequency, q) {
    if (amount <= 0) return;
    const context = audio.context;
    const frames = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    let held = 0;
    for (let i = 0; i < frames; i++) {
      if (i % 3 === 0) held = Math.random() * 2 - 1;
      data[i] = held;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.setValueAtTime(amount, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(destination);
    source.start(time);
  }

  function scheduleLead(destination, frequency, time, duration, velocity) {
    scheduleOscillator(destination, 'pulse18', frequency, time, duration, velocity, { wobble: 24 });
  }

  function scheduleGuitar(destination, frequency, time, duration, velocity) {
    scheduleOscillator(destination, 'sawtooth', frequency, time, duration, velocity * 0.55, { detune: -5 });
    scheduleOscillator(destination, 'square', frequency, time, duration * 0.96, velocity * 0.34, { detune: 5 });
    scheduleOscillator(destination, 'pulse18', frequency * 1.4983, time, duration * 0.88, velocity * 0.25);
    scheduleOscillator(destination, 'pulse12', frequency * 2, time, duration * 0.72, velocity * 0.17);
  }

  function scheduleBass(destination, frequency, time, duration, velocity) {
    scheduleOscillator(destination, 'sine', frequency / 2, time, duration, velocity * 0.72);
    scheduleOscillator(destination, 'triangle', frequency, time, duration, velocity * 1.3);
    scheduleOscillator(destination, 'square', frequency, time, duration * 0.88, velocity * 0.46);
    scheduleOscillator(destination, 'pulse12', frequency * 2, time, duration * 0.76, velocity * 0.34);
  }

  function scheduleDrum(destination, drum, time, accent) {
    const context = audio.context;
    const strength = accent ? 1.25 : 1;
    if (drum === 'KICK') {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(165, time);
      oscillator.frequency.exponentialRampToValueAtTime(43, time + 0.13);
      gain.gain.setValueAtTime(0.58 * strength, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
      oscillator.connect(gain).connect(destination);
      oscillator.start(time);
      oscillator.stop(time + 0.22);
    } else if (drum === 'SNARE') {
      scheduleFilteredNoise(destination, time, 0.15, 0.42 * strength, 'bandpass', 1800, 0.7);
      scheduleOscillator(destination, 'triangle', 175, time, 0.09, 0.13 * strength);
    } else if (drum === 'OPEN_HAT') {
      scheduleFilteredNoise(destination, time, 0.25, 0.18 * strength, 'highpass', 4300, 0.7);
    }
  }

  function scheduleStep(index, time) {
    IT_KNOWS_YOUR_NAME.layers.forEach((layer, layerIndex) => {
      const note = layer.notes[index];
      if (!note) return;
      const accent = layer.accents[index];
      if (!accent && layer.variance.nonAccentDropout > 0 &&
          Math.random() < layer.variance.nonAccentDropout) return;

      let mutation = 0;
      if (layer.instrument !== 'drums' && layer.variance.noteMutationChance > 0 &&
          Math.random() < layer.variance.noteMutationChance) {
        const range = Math.max(1, layer.variance.mutationSemitones);
        const distance = 1 + Math.floor(Math.random() * range);
        mutation = (Math.random() < 0.5 ? -1 : 1) * distance;
      }
      const cycleOffset = layer.instrument === 'drums'
        ? 0
        : cycleTransposeOffset(layer.variance.cycleTranspose, cycleIndex);
      const destination = audio.trackGains[layerIndex];
      if (layer.instrument === 'drums') {
        scheduleDrum(destination, note, time, accent);
        return;
      }

      const midi = noteToMidi(note);
      if (midi === null) return;
      const frequency = 440 * Math.pow(
        2,
        (midi + IT_KNOWS_YOUR_NAME.synth.transpose + cycleOffset + mutation - 69) / 12
      );
      const stepDuration = (60 / IT_KNOWS_YOUR_NAME.bpm) * IT_KNOWS_YOUR_NAME.stepBeats;
      const duration = Math.max(
        0.035,
        stepDuration * IT_KNOWS_YOUR_NAME.synth.gate * (layer.holds[index] || 1)
      );
      const velocity = accent ? 0.32 : 0.22;
      if (layer.instrument === 'guitar') {
        scheduleGuitar(destination, frequency, time, duration, velocity);
      } else if (layer.instrument === 'bass') {
        scheduleBass(destination, frequency, time, duration, velocity);
      } else {
        scheduleLead(destination, frequency, time, duration, velocity);
      }
    });
  }

  function scheduler() {
    if (!playing || !audio || audio.context.state !== 'running') return;
    const now = audio.context.currentTime;
    if (nextNoteTime < now - 0.1) nextNoteTime = now + 0.025;
    while (nextNoteTime < now + SCHEDULER_LOOKAHEAD) {
      scheduleStep(currentStep, nextNoteTime);
      nextNoteTime += (60 / IT_KNOWS_YOUR_NAME.bpm) * IT_KNOWS_YOUR_NAME.stepBeats;
      currentStep++;
      if (currentStep >= IT_KNOWS_YOUR_NAME.length) {
        currentStep = 0;
        cycleIndex++;
      }
    }
  }

  function setLayerCount(count, immediate = false) {
    activeLayerCount = Math.max(
      0,
      Math.min(IT_KNOWS_YOUR_NAME.layers.length, Math.floor(count))
    );
    if (!audio) return activeLayerCount;

    const activeLayers = new Set(
      IT_KNOWS_YOUR_NAME.layerOrder
        .slice(0, activeLayerCount)
        .map((layerNumber) => layerNumber - 1)
    );
    const now = audio.context.currentTime;
    audio.trackGains.forEach((gain, layerIndex) => {
      const target = activeLayers.has(layerIndex)
        ? IT_KNOWS_YOUR_NAME.layers[layerIndex].volume
        : 0;
      setAudioParam(gain.gain, target, now, immediate ? 0 : 0.45);
    });
    return activeLayerCount;
  }

  function resume() {
    const graph = createAudio();
    if (!graph) return Promise.resolve(false);
    const finishResume = () => {
      if (playing) {
        nextNoteTime = Math.max(nextNoteTime, graph.context.currentTime + 0.025);
        scheduler();
      }
      return true;
    };
    if (graph.context.state !== 'suspended') return Promise.resolve(finishResume());
    return graph.context.resume().then(finishResume).catch(() => false);
  }

  function prime() {
    return resume();
  }

  function start(initialLayerCount = 1) {
    const graph = createAudio();
    if (!graph) return false;
    if (schedulerTimer) window.clearInterval(schedulerTimer);
    playing = true;
    currentStep = 0;
    cycleIndex = 0;
    nextNoteTime = graph.context.currentTime + 0.045;
    setLayerCount(initialLayerCount, true);
    setAudioParam(graph.master.gain, MASTER_GAIN, graph.context.currentTime, 0.8);
    scheduler();
    schedulerTimer = window.setInterval(scheduler, 25);
    resume();
    return true;
  }

  function stop(fadeSeconds = 0.2) {
    playing = false;
    if (schedulerTimer) window.clearInterval(schedulerTimer);
    schedulerTimer = 0;
    if (!audio) return;
    setAudioParam(
      audio.master.gain,
      0.0001,
      audio.context.currentTime,
      Math.max(0, fadeSeconds)
    );
  }

  return Object.freeze({
    prime,
    resume,
    start,
    stop,
    setLayerCount,
    getLayerCount: () => activeLayerCount,
    isPlaying: () => playing
  });
}
