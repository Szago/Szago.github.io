(function () {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function noteTimeline(length, events) {
    const notes = Array(length).fill(null);
    events.forEach(([step, note]) => { notes[step] = note; });
    return notes;
  }

  function accentTimeline(length, steps) {
    const accents = Array(length).fill(false);
    steps.forEach((step) => { accents[step] = true; });
    return accents;
  }

  function holdTimeline(length, events) {
    const holds = Array(length).fill(1);
    events.forEach(([step, hold]) => { holds[step] = hold; });
    return holds;
  }

  function arrangedLayer(instrument, length, events, accents, holds, volume, variance) {
    return {
      instrument,
      volume,
      notes: noteTimeline(length, events),
      accents: accentTimeline(length, accents || []),
      holds: holdTimeline(length, holds || []),
      variance: variance || null
    };
  }

  const PRESETS = {
    grave: {
      name: 'Grave Signal', length: 10,
      notes: ['E3', 'A#2', 'E3', 'F3', 'D3', 'A#2', 'C#3', null, 'E2', 'F3'],
      accents: [true, false, false, true, false, false, true, false, true, false]
    },
    rift: {
      name: 'Rift Pursuit', length: 10,
      notes: ['D3', 'A2', 'D3', 'D#3', 'C3', 'F#2', 'G2', 'A2', 'C3', null],
      accents: [true, false, false, true, false, true, false, false, true, false]
    },
    crown: {
      name: 'Broken Crown', length: 9,
      notes: ['C#3', 'G2', 'A2', 'C#3', 'D3', 'G2', 'F3', 'D#3', 'C#3', null],
      accents: [true, false, false, false, true, false, true, false, true, false]
    },
    megalovania: {
      name: 'Megalovania — opening reference',
      length: 64,
      // Complete four-measure opening ostinato. Each measure repeats the
      // upper riff while its first two attacks descend D, C, B, then Bb.
      notes: noteTimeline(64, [
        [0, 'D3'], [1, 'D3'], [2, 'D4'], [4, 'A3'], [7, 'G#3'],
        [9, 'G3'], [11, 'F3'], [13, 'D3'], [14, 'F3'], [15, 'G3'],
        [16, 'C3'], [17, 'C3'], [18, 'D4'], [20, 'A3'], [23, 'G#3'],
        [25, 'G3'], [27, 'F3'], [29, 'D3'], [30, 'F3'], [31, 'G3'],
        [32, 'B2'], [33, 'B2'], [34, 'D4'], [36, 'A3'], [39, 'G#3'],
        [41, 'G3'], [43, 'F3'], [45, 'D3'], [46, 'F3'], [47, 'G3'],
        [48, 'A#2'], [49, 'A#2'], [50, 'D4'], [52, 'A3'], [55, 'G#3'],
        [57, 'G3'], [59, 'F3'], [61, 'D3'], [62, 'F3'], [63, 'G3']
      ]),
      accents: accentTimeline(64, [0, 16, 32, 48]),
      holds: holdTimeline(64, [[11, 2], [27, 2], [43, 2], [59, 2]]),
      settings: {
        bpm: 240, division: 2, gate: 58, voice: 'metalSquare', transpose: 0,
        bits: 8, drive: 62, cutoff: 5200, bass: 0, noise: 0, echo: 5,
        echoRate: 0.75
      }
    },
    trueHero: {
      name: 'Battle Against a True Hero — opening reference',
      length: 64,
      // Complete two-bar piano ostinato. The source's additional attacks are
      // echoes at 3/8-beat intervals, reproduced by the synth delay below.
      notes: noteTimeline(64, [
        [0, 'D#6'], [6, 'F6'], [12, 'A#5'], [18, 'C6'],
        [24, 'G#5'], [28, 'F5'], [32, 'C#6'], [38, 'G#5'],
        [44, 'D#6'], [50, 'G#5'], [56, 'G5'], [60, 'D#5']
      ]),
      accents: accentTimeline(64, [0, 32]),
      holds: holdTimeline(64, [
        [0, 6], [6, 6], [12, 6], [18, 6], [24, 4], [28, 4],
        [32, 6], [38, 6], [44, 6], [50, 6], [56, 4], [60, 4]
      ]),
      settings: {
        bpm: 150, division: 8, gate: 96, voice: 'pulse25', transpose: 0,
        bits: 9, drive: 16, cutoff: 6500, bass: 0, noise: 0, echo: 55,
        echoRate: 0.375
      }
    },
    sepulchre: {
      name: 'Sepulchre Machine',
      length: 16,
      layers: [
        arrangedLayer('lead', 16, [
          [0, 'E4'], [2, 'F4'], [4, 'A#3'], [6, 'E4'], [7, 'D#4'],
          [9, 'F4'], [11, 'C#4'], [12, 'E4'], [15, 'A#3']
        ], [0, 12], [[0, 2], [4, 2], [12, 2]], 78),
        arrangedLayer('guitar', 16, [
          [0, 'E2'], [4, 'F2'], [8, 'A#1'], [12, 'E2']
        ], [0, 8], [[0, 4], [4, 3], [8, 4], [12, 4]], 72),
        arrangedLayer('bass', 16, [
          [0, 'E2'], [2, 'E2'], [3, 'F2'], [4, 'E2'], [6, 'D#2'],
          [8, 'A#1'], [10, 'B1'], [12, 'E2'], [14, 'F2'], [15, 'D#2']
        ], [0, 8, 12], [[0, 2], [8, 2], [12, 2]], 76),
        arrangedLayer('drums', 16, [
          [0, 'KICK'], [2, 'HAT'], [4, 'SNARE'], [6, 'HAT'],
          [8, 'KICK'], [10, 'OPEN_HAT'], [12, 'SNARE'], [14, 'HAT'], [15, 'TOM']
        ], [0, 4, 8, 12], [], 78)
      ],
      settings: {
        bpm: 116, division: 4, gate: 68, voice: 'pulse12', transpose: 0,
        bits: 5, drive: 70, cutoff: 2100, bass: 0, noise: 8, echo: 20,
        echoRate: 0.5
      }
    },
    rustCathedral: {
      name: 'Rust Cathedral',
      length: 16,
      layers: [
        arrangedLayer('lead', 16, [
          [0, 'D4'], [1, 'D#4'], [3, 'A3'], [4, 'G#4'], [7, 'D4'],
          [8, 'C#4'], [10, 'G4'], [12, 'D#4'], [14, 'A3'], [15, 'D4']
        ], [0, 4, 8, 12], [[4, 2], [10, 2]], 80),
        arrangedLayer('guitar', 16, [
          [0, 'D2'], [4, 'G#1'], [8, 'C#2'], [12, 'D2']
        ], [0, 4, 12], [[0, 3], [4, 4], [8, 3], [12, 4]], 80),
        arrangedLayer('bass', 16, [
          [0, 'D2'], [2, 'D2'], [4, 'G#1'], [5, 'A1'], [7, 'C#2'],
          [8, 'D2'], [10, 'C#2'], [12, 'G#1'], [14, 'A1'], [15, 'C#2']
        ], [0, 4, 8, 12], [], 72),
        arrangedLayer('drums', 16, [
          [0, 'CRASH'], [2, 'KICK'], [3, 'HAT'], [4, 'SNARE'],
          [6, 'KICK'], [7, 'HAT'], [8, 'KICK'], [10, 'OPEN_HAT'],
          [12, 'SNARE'], [14, 'KICK'], [15, 'TOM']
        ], [0, 4, 8, 12], [], 82)
      ],
      settings: {
        bpm: 144, division: 4, gate: 58, voice: 'pulse37', transpose: 0,
        bits: 4, drive: 78, cutoff: 2900, bass: 0, noise: 6, echo: 10,
        echoRate: 0.25
      }
    },
    itKnows: {
      name: 'It Knows Your Name',
      length: 16,
      layerOrder: [4, 3, 2, 1],
      layers: [
        arrangedLayer('lead', 16, [
          [0, 'C#5'], [4, 'C5'], [7, 'G4'], [8, 'C#5'], [13, 'D5'], [15, 'G#4']
        ], [0, 8, 15], [[0, 4], [4, 2], [8, 4], [13, 2]], 72, {
          cycleTranspose: 'rise', noteVariance: 0, varianceRange: 1, dropout: 0
        }),
        arrangedLayer('guitar', 16, [
          [0, 'C#2'], [8, 'C2']
        ], [0, 8], [[0, 8], [8, 8]], 58),
        arrangedLayer('bass', 16, [
          [0, 'C#2'], [3, 'C#2'], [8, 'C2'], [11, 'B1'], [14, 'C#2']
        ], [0, 3, 8, 11], [[0, 2], [3, 2], [8, 2], [11, 2]], 82),
        arrangedLayer('drums', 16, [
          [0, 'KICK'], [3, 'KICK'], [7, 'OPEN_HAT'],
          [8, 'KICK'], [11, 'KICK'], [15, 'SNARE']
        ], [0, 3, 8, 11, 15], [], 64)
      ],
      settings: {
        bpm: 80, division: 4, gate: 80, voice: 'warblePulse',
        guitarVoice: 'doomStack', bassVoice: 'deepSub', pianoVoice: 'toyPiano',
        drumsVoice: 'machine', transpose: 0, bits: 4, drive: 15,
        cutoff: 2000, bass: 0, noise: 3, echo: 30, echoRate: 0.75
      }
    },
    testlOg: {
      name: '[OG] Death Encounter',
      length: 16,
      layerOrder: [3, 4, 2, 1],
      layers: [
        {
          instrument: 'lead',
          volume: 82,
          notes: [
            'E4', 'E4', 'E4', 'E4', 'F4', 'F4', 'D5', 'D5',
            'E4', 'E4', 'E4', 'E4', 'F4', 'F4', 'F5', 'F5'
          ],
          accents: accentTimeline(16, [0, 8]),
          holds: Array(16).fill(1),
          variance: { cycleTranspose: 'off', noteVariance: 0, varianceRange: 1, dropout: 0 }
        },
        {
          instrument: 'guitar',
          volume: 82,
          notes: [
            'E2', 'E2', null, null, 'B2', 'B2', null, null,
            'E2', 'E2', null, null, 'B2', 'B2', null, null
          ],
          accents: accentTimeline(16, [0, 8]),
          holds: holdTimeline(16, [[0, 2], [4, 2], [8, 2], [12, 2]]),
          variance: { cycleTranspose: 'off', noteVariance: 0, varianceRange: 1, dropout: 0 }
        },
        {
          instrument: 'bass',
          volume: 86,
          notes: [
            'E2', 'E2', 'E2', 'E2', 'A#2', 'A#2', 'F2', 'F2',
            'E2', 'E2', 'E2', 'E2', 'A#2', 'A#2', 'F#2', 'F#2'
          ],
          accents: accentTimeline(16, [0, 8]),
          holds: Array(16).fill(1),
          variance: { cycleTranspose: 'off', noteVariance: 0, varianceRange: 1, dropout: 0 }
        },
        {
          instrument: 'piano',
          volume: 100,
          notes: [
            'E4', 'E4', 'G4', 'G4', 'E4', 'E4', 'D5', 'D5',
            'E4', 'E4', 'G4', 'G4', 'E4', 'E4', 'F5', 'F5'
          ],
          accents: accentTimeline(16, [0, 8]),
          holds: holdTimeline(16, [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]]),
          variance: { cycleTranspose: 'off', noteVariance: 0, varianceRange: 1, dropout: 0 }
        }
      ],
      settings: {
        bpm: 60, division: 2, gate: 100, voice: 'pulse25',
        guitarVoice: 'doomStack', bassVoice: 'deepSub', pianoVoice: 'toyPiano',
        drumsVoice: 'machine', transpose: -2, bits: 6, drive: 1,
        cutoff: 2550, bass: 40, noise: 0, echo: 0, echoRate: 1
      }
    },
    redWake: {
      name: 'Red Wake Protocol',
      length: 16,
      layers: [
        arrangedLayer('lead', 16, [
          [0, 'D5'], [1, 'D5'], [4, 'F5'], [5, 'F5'], [7, 'D#5'],
          [8, 'D5'], [9, 'D5'], [12, 'C5'], [13, 'C5'], [15, 'G#4']
        ], [0, 4, 8, 12, 15], [], 76),
        arrangedLayer('guitar', 16, [], [], [], 68),
        arrangedLayer('bass', 16, [
          [0, 'D2'], [1, 'D2'], [4, 'D2'], [5, 'D2'],
          [8, 'D2'], [9, 'D2'], [12, 'C2'], [13, 'C2'], [14, 'C#2'], [15, 'D2']
        ], [0, 8, 12], [], 84),
        arrangedLayer('drums', 16, [
          [0, 'KICK'], [4, 'SNARE'], [8, 'KICK'], [12, 'SNARE'], [15, 'OPEN_HAT']
        ], [0, 4, 8, 12], [], 70)
      ],
      settings: {
        bpm: 250, division: 4, gate: 68, voice: 'metalSquare', transpose: 0,
        bits: 4, drive: 68, cutoff: 2500, bass: 0, noise: 4, echo: 10,
        echoRate: 0.5
      }
    },
    glassSaint: {
      name: 'Glass Saint Pursuit',
      length: 16,
      layers: [
        arrangedLayer('lead', 16, [
          [0, 'C#5'], [1, 'C#5'], [4, 'G5'], [5, 'G5'],
          [8, 'F#5'], [9, 'F#5'], [12, 'E5'], [13, 'E5'], [15, 'C#5']
        ], [0, 4, 8, 12], [[15, 2]], 80),
        arrangedLayer('guitar', 16, [
          [0, 'C#2'], [1, 'C#2'], [4, 'C#2'], [5, 'C#2'],
          [8, 'G1'], [9, 'G1'], [12, 'A#1'], [13, 'A#1']
        ], [0, 4, 8, 12], [], 72),
        arrangedLayer('bass', 16, [], [], [], 72),
        arrangedLayer('drums', 16, [
          [0, 'KICK'], [4, 'SNARE'], [8, 'KICK'], [12, 'SNARE'], [14, 'KICK']
        ], [0, 4, 8, 12], [], 74)
      ],
      settings: {
        bpm: 232, division: 4, gate: 72, voice: 'dualPulse', transpose: 0,
        bits: 5, drive: 58, cutoff: 3100, bass: 0, noise: 3, echo: 18,
        echoRate: 0.5
      }
    },
    choirTeeth: {
      name: 'The Choir Has Teeth',
      length: 16,
      layers: [
        arrangedLayer('lead', 16, [
          [4, 'C5'], [5, 'C5'], [8, 'G#4'], [9, 'G#4'],
          [12, 'D5'], [13, 'D5'], [15, 'C#5']
        ], [4, 8, 12, 15], [[15, 2]], 78),
        arrangedLayer('guitar', 16, [], [], [], 68),
        arrangedLayer('bass', 16, [
          [0, 'C2'], [1, 'C3'], [2, 'C2'], [4, 'C2'], [5, 'C3'], [6, 'C2'],
          [8, 'C2'], [9, 'C3'], [10, 'C2'], [12, 'G1'], [13, 'G#1'], [14, 'A1'], [15, 'A#1']
        ], [0, 4, 8, 12], [], 86),
        arrangedLayer('drums', 16, [
          [0, 'KICK'], [8, 'SNARE'], [12, 'KICK'], [15, 'OPEN_HAT']
        ], [0, 8, 12], [], 68)
      ],
      settings: {
        bpm: 250, division: 4, gate: 66, voice: 'warblePulse', transpose: 0,
        bits: 4, drive: 52, cutoff: 2100, bass: 0, noise: 5, echo: 20,
        echoRate: 0.5
      }
    }
  };

  const DEFAULT_SOUND = {
    bpm: 150, division: 2, gate: 72, voice: 'pulse25', transpose: 0,
    guitarVoice: 'doomStack', bassVoice: 'deepSub', pianoVoice: 'darkPiano',
    drumsVoice: 'machine',
    bits: 6, drive: 32, cutoff: 2600, bass: 24, noise: 11, echo: 18,
    echoRate: 0.75
  };

  const INSTRUMENTS = {
    lead: { label: 'Lead chip', pitched: true },
    guitar: { label: 'Metal guitar', pitched: true },
    bass: { label: 'Bass', pitched: true },
    piano: { label: 'Piano', pitched: true },
    drums: { label: 'Drums', pitched: false }
  };

  const DRUM_SOUNDS = [
    { id: 'KICK', label: 'Kick' },
    { id: 'SNARE', label: 'Snare' },
    { id: 'HAT', label: 'Closed hat' },
    { id: 'OPEN_HAT', label: 'Open hat' },
    { id: 'TOM', label: 'War tom' },
    { id: 'CRASH', label: 'Crash' }
  ];

  function emptyStep() {
    return { note: null, accent: false, hold: 1 };
  }

  function defaultVariance() {
    return { cycleTranspose: 'off', noteVariance: 0, varianceRange: 1, dropout: 0 };
  }

  function makeTrack(index, instrument) {
    return {
      id: 'layer' + (index + 1),
      name: 'Layer ' + (index + 1),
      instrument,
      order: index + 1,
      volume: instrument === 'bass' ? 86 : instrument === 'drums' ? 76 : instrument === 'piano' ? 78 : 82,
      muted: false,
      variance: defaultVariance(),
      steps: Array.from({ length: 10 }, emptyStep)
    };
  }

  const leadSteps = Array.from({ length: 10 }, emptyStep);
  const state = {
    length: 10,
    steps: leadSteps,
    tracks: [
      { ...makeTrack(0, 'lead'), steps: leadSteps },
      makeTrack(1, 'guitar'),
      makeTrack(2, 'bass'),
      makeTrack(3, 'drums')
    ],
    looping: false,
    playOnce: false,
    currentStep: 0,
    nextNoteTime: 0,
    cycleIndex: 0,
    timer: 0,
    visualTimers: [],
    pickerStep: 0,
    pickerTrack: 0,
    varianceTrack: 0
  };

  let audio = null;
  let periodicWaves = null;
  const $ = (id) => document.getElementById(id);
  const controlIds = [
    'bpm', 'division', 'gate', 'voice', 'guitarVoice', 'bassVoice', 'pianoVoice',
    'drumsVoice', 'transpose', 'bits', 'drive',
    'cutoff', 'bass', 'noise', 'echo', 'echoRate'
  ];
  const varianceControlIds = ['loopTranspose', 'noteVariance', 'varianceRange', 'dropout'];
  const composerControlIds = [
    'riffBias', 'echoBias', 'motifLock', 'development',
    'syncopation', 'ornaments', 'leaps', 'sustain'
  ];
  const COMPOSER_PRESETS = {
    balanced: {
      riffBias: 70, echoBias: 5, motifLock: 86, development: 42,
      syncopation: 64, ornaments: 34, leaps: 58, sustain: 26,
      randomDensity: 'steady'
    },
    riff: {
      riffBias: 85, echoBias: 5, motifLock: 93, development: 28,
      syncopation: 76, ornaments: 38, leaps: 72, sustain: 18,
      randomDensity: 'driving'
    },
    echo: {
      riffBias: 10, echoBias: 65, motifLock: 76, development: 62,
      syncopation: 58, ornaments: 30, leaps: 68, sustain: 64,
      randomDensity: 'steady'
    },
    horror: {
      riffBias: 55, echoBias: 15, motifLock: 62, development: 76,
      syncopation: 74, ornaments: 58, leaps: 64, sustain: 42,
      randomDensity: 'steady'
    }
  };
  const HOLD_VALUES = [1, 2, 3, 4, 6, 8, 12, 16];
  const TRACK_LABEL_WIDTH = 180;

  function ensureStepCount(count) {
    state.tracks.forEach((track) => {
      while (track.steps.length < count) track.steps.push(emptyStep());
    });
  }

  function addLayer() {
    if (state.tracks.length >= 16) {
      setStatus('Layer limit reached (16)', state.looping);
      return;
    }
    const instruments = ['lead', 'guitar', 'bass', 'drums', 'piano'];
    const trackIndex = state.tracks.length;
    const track = makeTrack(trackIndex, instruments[trackIndex % instruments.length]);
    track.steps = Array.from({ length: state.length }, emptyStep);
    state.tracks.push(track);
    ensureAudioTrackGains();
    buildSteps();
    updateTrackMix();
    updateConfigPreview();
    setStatus('Added ' + track.name, state.looping);
  }

  function clearLayer(trackIndex) {
    const track = state.tracks[trackIndex];
    if (!track) return;
    clearTrack(track);
    syncSteps();
    updateConfigPreview();
    setStatus('Cleared ' + track.name, state.looping);
  }

  function setLength(value) {
    const length = Math.max(1, Math.min(512, Math.floor(Number(value) || 1)));
    state.length = length;
    if (state.currentStep >= length) state.currentStep = 0;
    ensureStepCount(length);
    $('length').value = String(length);
    buildSteps();
    updateReadouts();
  }

  function buildSteps() {
    const host = $('steps');
    ensureStepCount(state.length);
    const previousScroll = host.scrollLeft;
    host.innerHTML = '';
    const columns = TRACK_LABEL_WIDTH + 'px repeat(' + state.length + ', 76px)';
    const division = Math.max(1, Number($('division').value));

    const ruler = document.createElement('div');
    ruler.className = 'timeline-ruler';
    ruler.style.gridTemplateColumns = columns;
    const corner = document.createElement('div');
    corner.className = 'ruler-corner';
    corner.textContent = 'LAYERS / STEPS';
    ruler.appendChild(corner);
    for (let index = 0; index < state.length; index++) {
      const marker = document.createElement('div');
      marker.className = 'ruler-step' + (index % division === 0 ? ' beat' : '');
      marker.textContent = index + 1;
      marker.title = 'Step ' + (index + 1) + (index % division === 0 ? ' · beat ' + (Math.floor(index / division) + 1) : '');
      ruler.appendChild(marker);
    }
    host.appendChild(ruler);

    state.tracks.forEach((track, trackIndex) => {
      const row = document.createElement('div');
      row.className = 'timeline-track';
      row.dataset.track = trackIndex;
      row.dataset.instrument = track.instrument;
      row.style.gridTemplateColumns = columns;
      row.appendChild(buildTrackLabel(track, trackIndex));

      track.steps.slice(0, state.length).forEach((step, index) => {
        const card = document.createElement('div');
        card.className = 'step' + (index % division === 0 ? ' beat' : '');
        card.dataset.track = trackIndex;
        card.dataset.step = index;

        const noteButton = document.createElement('button');
        noteButton.type = 'button';
        noteButton.className = 'note-button';
        noteButton.setAttribute('aria-label', 'Choose event for ' + track.name + ', step ' + (index + 1));
        noteButton.addEventListener('click', () => openNotePicker(trackIndex, index));

        const actions = document.createElement('div');
        actions.className = 'step-actions';
        const accent = document.createElement('button');
        accent.type = 'button';
        accent.className = 'accent';
        accent.textContent = 'ACC';
        accent.title = 'Toggle accent';
        accent.addEventListener('click', () => {
          step.accent = !step.accent;
          syncSteps();
          updateConfigPreview();
        });
        const hold = document.createElement('button');
        hold.type = 'button';
        hold.className = 'hold';
        hold.title = 'Cycle note hold length';
        hold.disabled = !INSTRUMENTS[track.instrument].pitched;
        hold.addEventListener('click', () => {
          const current = HOLD_VALUES.indexOf(step.hold || 1);
          step.hold = HOLD_VALUES[(current + 1) % HOLD_VALUES.length];
          syncSteps();
          updateConfigPreview();
        });
        const audition = document.createElement('button');
        audition.type = 'button';
        audition.className = 'audition';
        audition.textContent = '♪';
        audition.title = 'Audition this event';
        audition.setAttribute('aria-label', 'Audition ' + track.name + ', step ' + (index + 1));
        audition.addEventListener('click', () => auditionStep(trackIndex, index));

        actions.append(accent, hold, audition);
        card.append(noteButton, actions);
        row.appendChild(card);
      });
      host.appendChild(row);
    });
    syncSteps();
    syncVarianceLayerOptions();
    host.scrollLeft = previousScroll;
  }

  function syncVarianceLayerOptions() {
    const select = $('varianceLayer');
    state.varianceTrack = Math.max(0, Math.min(state.tracks.length - 1, state.varianceTrack));
    select.innerHTML = '';
    state.tracks.forEach((track, trackIndex) => {
      const option = document.createElement('option');
      option.value = String(trackIndex);
      option.textContent = track.name + ' \u2014 ' + INSTRUMENTS[track.instrument].label;
      select.appendChild(option);
    });
    select.value = String(state.varianceTrack);
  }

  function syncVarianceControls() {
    const variance = state.tracks[state.varianceTrack].variance;
    $('loopTranspose').value = variance.cycleTranspose;
    $('noteVariance').value = String(Math.round(variance.noteVariance * 100));
    $('varianceRange').value = String(variance.varianceRange);
    $('dropout').value = String(Math.round(variance.dropout * 100));
    updateReadouts();
  }

  function saveVarianceControls() {
    const variance = state.tracks[state.varianceTrack].variance;
    variance.cycleTranspose = $('loopTranspose').value;
    variance.noteVariance = Number($('noteVariance').value) / 100;
    variance.varianceRange = Number($('varianceRange').value);
    variance.dropout = Number($('dropout').value) / 100;
    updateReadouts();
  }

  function setLayerOrder(trackIndex, nextOrder) {
    const track = state.tracks[trackIndex];
    const previousOrder = track.order;
    const displaced = state.tracks.find((candidate) => candidate !== track && candidate.order === nextOrder);
    track.order = nextOrder;
    if (displaced) displaced.order = previousOrder;
    buildSteps();
    updateConfigPreview();
    setStatus(
      track.name + ' will enter #' + nextOrder + (displaced ? ' · swapped with ' + displaced.name : ''),
      state.looping
    );
  }

  function buildTrackLabel(track, trackIndex) {
    const label = document.createElement('div');
    label.className = 'track-label';
    const name = document.createElement('div');
    name.className = 'track-name';
    name.innerHTML = '<span>' + track.name.toUpperCase() + '</span>';
    const mute = document.createElement('button');
    mute.type = 'button';
    mute.className = 'track-mute' + (track.muted ? ' on' : '');
    mute.textContent = track.muted ? 'MUTED' : 'MUTE';
    mute.addEventListener('click', () => {
      track.muted = !track.muted;
      buildSteps();
      updateTrackMix();
      updateConfigPreview();
    });
    const randomizeButton = document.createElement('button');
    randomizeButton.type = 'button';
    randomizeButton.className = 'track-randomize';
    randomizeButton.textContent = 'RND';
    randomizeButton.title = 'Dark-randomize only ' + track.name;
    randomizeButton.setAttribute('aria-label', 'Dark-randomize only ' + track.name);
    randomizeButton.addEventListener('click', () => randomizeTrack(trackIndex));
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'track-clear';
    clearButton.textContent = 'CLR';
    clearButton.title = 'Clear every event from ' + track.name;
    clearButton.setAttribute('aria-label', 'Clear every event from ' + track.name);
    clearButton.addEventListener('click', () => clearLayer(trackIndex));
    name.append(mute, randomizeButton, clearButton);

    const instrument = document.createElement('select');
    instrument.setAttribute('aria-label', track.name + ' instrument');
    Object.entries(INSTRUMENTS).forEach(([value, definition]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = definition.label;
      instrument.appendChild(option);
    });
    instrument.value = track.instrument;
    instrument.addEventListener('change', () => {
      const wasPitched = INSTRUMENTS[track.instrument].pitched;
      const willBePitched = INSTRUMENTS[instrument.value].pitched;
      track.instrument = instrument.value;
      if (wasPitched !== willBePitched) {
        track.steps.forEach((step) => {
          step.note = null;
          step.accent = false;
          step.hold = 1;
        });
        setStatus(track.name + ' cleared incompatible events', state.looping);
      }
      buildSteps();
      updateTrackMix();
      updateConfigPreview();
    });

    const order = document.createElement('select');
    order.className = 'track-order';
    order.title = 'Entrance order for ' + track.name;
    order.setAttribute('aria-label', 'Entrance order for ' + track.name);
    state.tracks.forEach((candidate, orderIndex) => {
      const option = document.createElement('option');
      option.value = String(orderIndex + 1);
      option.textContent = '#' + (orderIndex + 1);
      order.appendChild(option);
    });
    order.value = String(track.order);
    order.addEventListener('change', () => setLayerOrder(trackIndex, Number(order.value)));
    const selects = document.createElement('div');
    selects.className = 'track-selects';
    selects.append(instrument, order);

    const volume = document.createElement('label');
    volume.className = 'track-volume';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(track.volume);
    slider.setAttribute('aria-label', track.name + ' volume');
    const output = document.createElement('span');
    output.textContent = track.volume + '%';
    slider.addEventListener('input', () => {
      track.volume = Number(slider.value);
      output.textContent = track.volume + '%';
      updateTrackMix();
      updateConfigPreview();
    });
    volume.append(slider, output);
    label.append(name, selects, volume);
    return label;
  }

  function syncSteps() {
    document.querySelectorAll('.step').forEach((card, index) => {
      const trackIndex = Number(card.dataset.track);
      const stepIndex = Number(card.dataset.step);
      const track = state.tracks[trackIndex];
      const step = track.steps[stepIndex];
      const note = step.note;
      const noteButton = card.querySelector('.note-button');
      noteButton.textContent = eventLabel(note, track.instrument);
      noteButton.classList.toggle('is-rest', !note);
      card.classList.toggle('has-event', Boolean(note));
      card.querySelector('.accent').classList.toggle('on', step.accent);
      card.querySelector('.hold').textContent = INSTRUMENTS[track.instrument].pitched ? '×' + (step.hold || 1) : '—';
    });
  }

  function eventLabel(note, instrument) {
    if (!note) return '— REST —';
    if (instrument !== 'drums') return note;
    const sound = DRUM_SOUNDS.find((item) => item.id === note);
    return sound ? sound.label.toUpperCase() : note;
  }

  function buildNotePicker() {
    const host = $('noteGrid');
    host.innerHTML = '';
    for (let octave = 1; octave <= 6; octave++) {
      const row = document.createElement('div');
      row.className = 'octave-row';
      const label = document.createElement('div');
      label.className = 'octave-label';
      label.textContent = 'OCT ' + octave;
      const notes = document.createElement('div');
      notes.className = 'octave-notes';
      NOTE_NAMES.forEach((name) => {
        const note = name + octave;
        const choice = document.createElement('div');
        choice.className = 'note-choice';
        choice.dataset.note = note;
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'choose-note';
        choose.textContent = note;
        choose.title = 'Select ' + note;
        choose.addEventListener('click', () => selectPickerNote(note));
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.className = 'preview-note';
        preview.textContent = '♪';
        preview.title = 'Preview ' + note;
        preview.setAttribute('aria-label', 'Preview ' + note);
        preview.addEventListener('click', () => auditionValue(note));
        choice.append(choose, preview);
        notes.appendChild(choice);
      });
      row.append(label, notes);
      host.appendChild(row);
    }
  }

  function buildDrumPicker() {
    const host = $('drumGrid');
    host.innerHTML = '';
    DRUM_SOUNDS.forEach((sound) => {
      const choice = document.createElement('div');
      choice.className = 'drum-choice';
      choice.dataset.drum = sound.id;
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'choose-drum';
      choose.textContent = sound.label;
      choose.addEventListener('click', () => selectPickerNote(sound.id));
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'preview-drum';
      preview.textContent = '♪';
      preview.setAttribute('aria-label', 'Preview ' + sound.label);
      preview.addEventListener('click', () => auditionValue(sound.id));
      choice.append(choose, preview);
      host.appendChild(choice);
    });
  }

  function openNotePicker(trackIndex, index) {
    state.pickerTrack = trackIndex;
    state.pickerStep = index;
    const track = state.tracks[trackIndex];
    const drums = track.instrument === 'drums';
    $('notePickerTitle').textContent = drums ? 'Choose drum' : 'Choose note';
    $('notePickerStep').textContent = track.name + ' · Step ' + String(index + 1).padStart(2, '0');
    $('noteGrid').hidden = drums;
    $('drumGrid').hidden = !drums;
    $('pickerHelp').textContent = drums
      ? 'Choose a synthesized drum hit. Use ♪ to preview it without closing.'
      : 'Click a note name to select it. Use ♪ to preview without closing.';
    refreshPickerSelection();
    $('notePickerOverlay').hidden = false;
    $('closeNotePicker').focus();
  }

  function closeNotePicker() {
    $('notePickerOverlay').hidden = true;
    const stepButton = document.querySelector(
      '.step[data-track="' + state.pickerTrack + '"][data-step="' + state.pickerStep + '"] .note-button'
    );
    if (stepButton) stepButton.focus();
  }

  function refreshPickerSelection() {
    const track = state.tracks[state.pickerTrack];
    const selected = track.steps[state.pickerStep] && track.steps[state.pickerStep].note;
    document.querySelectorAll('.note-choice').forEach((choice) => {
      choice.classList.toggle('selected', choice.dataset.note === selected);
    });
    document.querySelectorAll('.drum-choice').forEach((choice) => {
      choice.classList.toggle('selected', choice.dataset.drum === selected);
    });
  }

  function selectPickerNote(note) {
    state.tracks[state.pickerTrack].steps[state.pickerStep].note = note;
    syncSteps();
    updateConfigPreview();
    if (note) auditionValue(note);
    closeNotePicker();
  }

  function getSettings() {
    return {
      bpm: Number($('bpm').value),
      division: Number($('division').value),
      gate: Number($('gate').value) / 100,
      voice: $('voice').value,
      guitarVoice: $('guitarVoice').value,
      bassVoice: $('bassVoice').value,
      pianoVoice: $('pianoVoice').value,
      drumsVoice: $('drumsVoice').value,
      transpose: Number($('transpose').value),
      bits: Number($('bits').value),
      drive: Number($('drive').value) / 100,
      cutoff: Number($('cutoff').value),
      bass: Number($('bass').value) / 100,
      noise: Number($('noise').value) / 100,
      echo: Number($('echo').value) / 100,
      echoRate: Number($('echoRate').value)
    };
  }

  function getConfig() {
    const sound = getSettings();
    return {
      name: PRESETS[$('preset').value].name,
      bpm: sound.bpm,
      stepsPerBeat: sound.division,
      stepBeats: 1 / sound.division,
      length: state.length,
      layerOrder: state.tracks
        .map((track, trackIndex) => ({ track, layerNumber: trackIndex + 1 }))
        .sort((a, b) => a.track.order - b.track.order)
        .map((entry) => entry.layerNumber),
      layers: state.tracks.map((track) => ({
        name: track.name,
        instrument: track.instrument,
        volume: track.volume / 100,
        muted: track.muted,
        notes: track.steps.slice(0, state.length).map((step) => step.note),
        accents: track.steps.slice(0, state.length).map((step) => step.accent),
        holds: track.steps.slice(0, state.length).map((step) => step.hold || 1),
        variance: {
          cycleTranspose: track.variance.cycleTranspose,
          noteMutationChance: track.variance.noteVariance,
          mutationSemitones: track.variance.varianceRange,
          nonAccentDropout: track.variance.dropout
        }
      })),
      synth: {
        voice: sound.voice,
        guitarVoice: sound.guitarVoice,
        bassVoice: sound.bassVoice,
        pianoVoice: sound.pianoVoice,
        drumsVoice: sound.drumsVoice,
        gate: sound.gate,
        transpose: sound.transpose,
        bitDepth: sound.bits,
        drive: sound.drive,
        cutoffHz: sound.cutoff,
        bass: sound.bass,
        noise: sound.noise,
        echo: sound.echo,
        echoBeats: sound.echoRate
      }
    };
  }

  function updateReadouts() {
    const settings = getSettings();
    const variance = state.tracks[state.varianceTrack].variance;
    const seconds = state.length * (60 / settings.bpm / settings.division);
    const beats = state.length / settings.division;
    $('bpmOut').textContent = settings.bpm;
    $('gateOut').textContent = Math.round(settings.gate * 100) + '%';
    $('transposeOut').textContent = (settings.transpose >= 0 ? '+' : '') + settings.transpose;
    $('bitsOut').textContent = settings.bits + '-bit';
    $('driveOut').textContent = Math.round(settings.drive * 100) + '%';
    $('cutoffOut').textContent = settings.cutoff + ' Hz';
    $('bassOut').textContent = Math.round(settings.bass * 100) + '%';
    $('noiseOut').textContent = Math.round(settings.noise * 100) + '%';
    $('echoOut').textContent = Math.round(settings.echo * 100) + '%';
    $('noteVarianceOut').textContent = Math.round(variance.noteVariance * 100) + '%';
    $('dropoutOut').textContent = Math.round(variance.dropout * 100) + '%';
    $('lengthOut').textContent = state.length + (state.length === 1 ? ' step' : ' steps');
    $('tempoBig').textContent = settings.bpm + ' BPM';
    $('loopInfo').textContent = state.length + ' steps · ' + formatNumber(beats) + ' beats · ' + seconds.toFixed(2) + 's';
    if (audio) updateAudioEffects(settings);
    updateConfigPreview();
  }

  function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '');
  }

  function createAudio() {
    if (audio) return audio;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('This browser does not support the Web Audio API.');
    const context = new AudioContext();
    const input = context.createGain();
    const preCompressor = context.createDynamicsCompressor();
    const crusher = context.createWaveShaper();
    const drive = context.createWaveShaper();
    const filter = context.createBiquadFilter();
    const dry = context.createGain();
    const delay = context.createDelay(2);
    const feedback = context.createGain();
    const wet = context.createGain();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const analyser = context.createAnalyser();
    const trackGains = state.tracks.map(() => context.createGain());

    input.gain.value = 0.68;
    preCompressor.threshold.value = -10;
    preCompressor.knee.value = 8;
    preCompressor.ratio.value = 3;
    preCompressor.attack.value = 0.002;
    preCompressor.release.value = 0.08;
    filter.type = 'lowpass';
    filter.Q.value = 1.2;
    master.gain.value = 0.58;
    compressor.threshold.value = -15;
    compressor.knee.value = 4;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.25;

    trackGains.forEach((gain) => gain.connect(input));
    input.connect(preCompressor).connect(crusher).connect(drive).connect(filter);
    filter.connect(dry).connect(master);
    filter.connect(delay).connect(wet).connect(master);
    delay.connect(feedback).connect(delay);
    master.connect(compressor).connect(analyser).connect(context.destination);

    audio = {
      context, input, preCompressor, crusher, drive, filter,
      dry, delay, feedback, wet, master, analyser, trackGains
    };
    periodicWaves = {
      pulse06: makePulseWave(context, 0.0625),
      pulse12: makePulseWave(context, 0.125),
      pulse18: makePulseWave(context, 0.1875),
      pulse25: makePulseWave(context, 0.25),
      pulse37: makePulseWave(context, 0.375)
    };
    updateTrackMix();
    updateAudioEffects(getSettings());
    drawScope();
    return audio;
  }

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
      const x = i / (size - 1) * 2 - 1;
      curve[i] = Math.round(x * levels) / levels;
    }
    return curve;
  }

  function makeDriveCurve(amount) {
    const size = 32768;
    const curve = new Float32Array(size);
    const k = amount * 35;
    for (let i = 0; i < size; i++) {
      const x = i / (size - 1) * 2 - 1;
      curve[i] = k < 0.0001
        ? x
        : ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  function updateAudioEffects(settings) {
    const now = audio.context.currentTime;
    audio.crusher.curve = makeCrusherCurve(settings.bits);
    audio.crusher.oversample = 'none';
    audio.drive.curve = makeDriveCurve(settings.drive);
    audio.drive.oversample = 'none';
    audio.filter.frequency.setTargetAtTime(settings.cutoff, now, 0.01);
    audio.delay.delayTime.setTargetAtTime((60 / settings.bpm) * settings.echoRate, now, 0.01);
    audio.wet.gain.setTargetAtTime(settings.echo * 0.9, now, 0.01);
    audio.feedback.gain.setTargetAtTime(Math.min(0.6, settings.echo * 1.05), now, 0.01);
  }

  function ensureAudioTrackGains() {
    if (!audio) return;
    while (audio.trackGains.length < state.tracks.length) {
      const gain = audio.context.createGain();
      gain.gain.value = 0;
      gain.connect(audio.input);
      audio.trackGains.push(gain);
    }
  }

  function updateTrackMix() {
    if (!audio) return;
    ensureAudioTrackGains();
    const now = audio.context.currentTime;
    state.tracks.forEach((track, index) => {
      const level = track.muted ? 0 : track.volume / 100;
      audio.trackGains[index].gain.setTargetAtTime(level, now, 0.008);
    });
  }

  function noteToMidi(note) {
    const match = /^([A-G])(#?)(\d)$/.exec(note || '');
    if (!match) return null;
    const pitch = NOTE_NAMES.indexOf(match[1] + match[2]);
    return (Number(match[3]) + 1) * 12 + pitch;
  }

  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function scheduleOscillator(context, destination, voice, frequency, time, duration, gainAmount, options) {
    options = options || {};
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    if (periodicWaves[voice]) oscillator.setPeriodicWave(periodicWaves[voice]);
    else oscillator.type = voice;
    oscillator.frequency.setValueAtTime(frequency * 1.012, time);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, time + Math.min(0.025, duration * 0.2));
    if (options.wobble) {
      const curve = new Float32Array(32);
      for (let i = 0; i < curve.length; i++) {
        curve[i] = (options.detune || 0) + Math.sin(i / (curve.length - 1) * Math.PI * 8) * options.wobble;
      }
      oscillator.detune.setValueCurveAtTime(curve, time, duration);
    } else {
      oscillator.detune.setValueAtTime(options.detune || 0, time);
    }
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(gainAmount, time + 0.004);
    envelope.gain.setValueAtTime(gainAmount, Math.max(time + 0.005, time + duration * 0.64));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  function scheduleLeadVoice(context, destination, voice, frequency, time, duration, velocity) {
    if (voice === 'dualPulse') {
      scheduleOscillator(context, destination, 'pulse25', frequency, time, duration, velocity * 0.56, { detune: -7 });
      scheduleOscillator(context, destination, 'pulse18', frequency, time, duration, velocity * 0.56, { detune: 7 });
      return;
    }
    if (voice === 'octavePulse') {
      scheduleOscillator(context, destination, 'pulse25', frequency, time, duration, velocity * 0.74);
      scheduleOscillator(context, destination, 'pulse12', frequency * 2, time, duration * 0.91, velocity * 0.34);
      return;
    }
    if (voice === 'fifthPulse') {
      scheduleOscillator(context, destination, 'pulse12', frequency, time, duration, velocity * 0.7);
      scheduleOscillator(context, destination, 'pulse18', frequency * Math.SQRT2, time, duration * 0.88, velocity * 0.42);
      return;
    }
    if (voice === 'metalSquare') {
      scheduleOscillator(context, destination, 'square', frequency, time, duration, velocity * 0.68);
      scheduleOscillator(context, destination, 'square', frequency * 2.015, time, duration * 0.68, velocity * 0.34, { detune: 11 });
      return;
    }
    if (voice === 'warblePulse') {
      scheduleOscillator(context, destination, 'pulse18', frequency, time, duration, velocity, { wobble: 24 });
      return;
    }
    scheduleOscillator(context, destination, voice, frequency, time, duration, velocity);
  }

  function scheduleNoise(context, destination, time, duration, amount) {
    if (amount <= 0) return;
    const frames = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    let held = 0;
    for (let i = 0; i < frames; i++) {
      if (i % 8 === 0) held = Math.random() * 2 - 1;
      data[i] = held;
    }
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    highpass.type = 'highpass';
    highpass.frequency.value = 900;
    gain.gain.setValueAtTime(amount, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(highpass).connect(gain).connect(destination);
    source.start(time);
  }

  function scheduleGuitar(destination, frequency, time, duration, velocity, voice) {
    const context = audio.context;
    if (voice === 'palmChug') {
      scheduleOscillator(context, destination, 'sawtooth', frequency, time, duration * 0.62, velocity * 0.7);
      scheduleOscillator(context, destination, 'square', frequency * 2, time, duration * 0.42, velocity * 0.2);
      return;
    }
    if (voice === 'razorLead') {
      scheduleOscillator(context, destination, 'pulse12', frequency, time, duration, velocity * 0.72, { detune: -4 });
      scheduleOscillator(context, destination, 'sawtooth', frequency * 2, time, duration * 0.85, velocity * 0.3, { detune: 6 });
      return;
    }
    if (voice === 'octaveGuitar') {
      scheduleOscillator(context, destination, 'sawtooth', frequency, time, duration, velocity * 0.62, { detune: -5 });
      scheduleOscillator(context, destination, 'square', frequency * 2, time, duration * 0.9, velocity * 0.42, { detune: 5 });
      scheduleOscillator(context, destination, 'pulse18', frequency / 2, time, duration, velocity * 0.24);
      return;
    }
    scheduleOscillator(context, destination, 'sawtooth', frequency, time, duration, velocity * 0.55, { detune: -5 });
    scheduleOscillator(context, destination, 'square', frequency, time, duration * 0.96, velocity * 0.34, { detune: 5 });
    scheduleOscillator(context, destination, 'pulse18', frequency * 1.4983, time, duration * 0.88, velocity * 0.25);
    scheduleOscillator(context, destination, 'pulse12', frequency * 2, time, duration * 0.72, velocity * 0.17);
  }

  function scheduleBass(destination, frequency, time, duration, velocity, voice) {
    const context = audio.context;
    if (voice === 'growlBass') {
      scheduleOscillator(context, destination, 'sawtooth', frequency, time, duration, velocity * 1.05, { detune: -5 });
      scheduleOscillator(context, destination, 'square', frequency, time, duration * 0.94, velocity * 0.72, { detune: 5 });
      scheduleOscillator(context, destination, 'triangle', frequency / 2, time, duration, velocity * 0.5);
      return;
    }
    if (voice === 'pulseBass') {
      scheduleOscillator(context, destination, 'pulse25', frequency, time, duration, velocity * 1.2);
      scheduleOscillator(context, destination, 'pulse12', frequency * 2, time, duration * 0.82, velocity * 0.5);
      scheduleOscillator(context, destination, 'triangle', frequency / 2, time, duration, velocity * 0.38);
      return;
    }
    if (voice === 'hollowBass') {
      scheduleOscillator(context, destination, 'sine', frequency / 2, time, duration, velocity * 0.82);
      scheduleOscillator(context, destination, 'triangle', frequency, time, duration, velocity * 1.0);
      scheduleOscillator(context, destination, 'sine', frequency * 2, time, duration * 0.9, velocity * 0.32);
      return;
    }
    // A strong fundamental plus audible upper harmonics: still deep on
    // headphones, but present on small speakers that cannot reproduce the sub.
    scheduleOscillator(context, destination, 'sine', frequency / 2, time, duration, velocity * 0.72);
    scheduleOscillator(context, destination, 'triangle', frequency, time, duration, velocity * 1.3);
    scheduleOscillator(context, destination, 'square', frequency, time, duration * 0.88, velocity * 0.46);
    scheduleOscillator(context, destination, 'pulse12', frequency * 2, time, duration * 0.76, velocity * 0.34);
  }

  function schedulePianoPartial(destination, type, frequency, time, duration, amount, detune) {
    const context = audio.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.detune.value = detune || 0;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(amount, time + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  function schedulePiano(destination, frequency, time, duration, velocity, voice) {
    const ring = Math.max(0.22, Math.min(1.4, duration * 1.8));
    if (voice === 'toyPiano') {
      schedulePianoPartial(destination, 'square', frequency * 2, time, ring * 0.55, velocity * 0.72);
      schedulePianoPartial(destination, 'sine', frequency * 4.02, time, ring * 0.42, velocity * 0.34);
      return;
    }
    if (voice === 'glassPiano') {
      schedulePianoPartial(destination, 'sine', frequency, time, ring, velocity * 0.8);
      schedulePianoPartial(destination, 'sine', frequency * 2.01, time, ring * 0.92, velocity * 0.5);
      schedulePianoPartial(destination, 'sine', frequency * 4.03, time, ring * 0.72, velocity * 0.24);
      return;
    }
    if (voice === 'detunedPiano') {
      schedulePianoPartial(destination, 'triangle', frequency, time, ring, velocity * 0.72, -9);
      schedulePianoPartial(destination, 'triangle', frequency, time, ring * 0.96, velocity * 0.72, 9);
      schedulePianoPartial(destination, 'sine', frequency * 2, time, ring * 0.7, velocity * 0.28);
      return;
    }
    schedulePianoPartial(destination, 'triangle', frequency, time, ring, velocity * 0.95);
    schedulePianoPartial(destination, 'sine', frequency * 2, time, ring * 0.78, velocity * 0.42);
    schedulePianoPartial(destination, 'sine', frequency * 3, time, ring * 0.5, velocity * 0.2);
  }

  function scheduleDrum(destination, drum, time, accent, voice) {
    const context = audio.context;
    const kit = {
      machine: { gain: 1, pitch: 1, decay: 1, noise: 1 },
      industrial: { gain: 1.08, pitch: 1.32, decay: 1.28, noise: 1.3 },
      hollow: { gain: 0.94, pitch: 0.68, decay: 1.5, noise: 0.72 },
      bitKit: { gain: 0.9, pitch: 1.7, decay: 0.62, noise: 0.9 }
    }[voice] || { gain: 1, pitch: 1, decay: 1, noise: 1 };
    const strength = (accent ? 1.25 : 1) * kit.gain;
    if (drum === 'KICK') {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = voice === 'industrial' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(165 * kit.pitch, time);
      oscillator.frequency.exponentialRampToValueAtTime(43 * kit.pitch, time + 0.13 * kit.decay);
      gain.gain.setValueAtTime(0.58 * strength, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2 * kit.decay);
      oscillator.connect(gain).connect(destination);
      oscillator.start(time);
      oscillator.stop(time + 0.22 * kit.decay);
      return;
    }
    if (drum === 'SNARE') {
      scheduleFilteredNoise(destination, time, 0.15 * kit.decay, 0.42 * strength * kit.noise, 'bandpass', 1800 * kit.pitch, 0.7);
      scheduleOscillator(context, destination, 'triangle', 175 * kit.pitch, time, 0.09 * kit.decay, 0.13 * strength);
      return;
    }
    if (drum === 'HAT') {
      scheduleFilteredNoise(destination, time, 0.055 * kit.decay, 0.2 * strength * kit.noise, 'highpass', Math.min(7600, 5200 * kit.pitch), 0.8);
      return;
    }
    if (drum === 'OPEN_HAT') {
      scheduleFilteredNoise(destination, time, 0.25 * kit.decay, 0.18 * strength * kit.noise, 'highpass', Math.min(7200, 4300 * kit.pitch), 0.7);
      return;
    }
    if (drum === 'TOM') {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(190 * kit.pitch, time);
      oscillator.frequency.exponentialRampToValueAtTime(82 * kit.pitch, time + 0.18 * kit.decay);
      gain.gain.setValueAtTime(0.38 * strength, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26 * kit.decay);
      oscillator.connect(gain).connect(destination);
      oscillator.start(time);
      oscillator.stop(time + 0.28 * kit.decay);
      return;
    }
    if (drum === 'CRASH') {
      scheduleFilteredNoise(destination, time, 0.65 * kit.decay, 0.24 * strength * kit.noise, 'highpass', 2600 * kit.pitch, 0.5);
    }
  }

  function scheduleFilteredNoise(destination, time, duration, amount, type, frequency, q) {
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

  function scheduleStep(index, time, settings) {
    state.tracks.forEach((track, trackIndex) => {
      const step = track.steps[index];
      const variance = track.variance;
      if (!step.note || track.muted) return;
      if (!step.accent && variance.dropout > 0 && Math.random() < variance.dropout) return;
      let mutation = 0;
      if (INSTRUMENTS[track.instrument].pitched &&
          variance.noteVariance > 0 &&
          Math.random() < variance.noteVariance) {
        const distance = 1 + Math.floor(Math.random() * variance.varianceRange);
        mutation = (Math.random() < 0.5 ? -1 : 1) * distance;
      }
      const cycleOffset = INSTRUMENTS[track.instrument].pitched
        ? cycleTransposeOffset(variance.cycleTranspose, state.cycleIndex)
        : 0;
      scheduleEvent(
        track.instrument,
        step,
        time,
        settings,
        audio.trackGains[trackIndex],
        cycleOffset + mutation
      );
    });
    queueVisualStep(index, time);
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

  function scheduleEvent(instrument, step, time, settings, destination, pitchOffset) {
    if (instrument === 'drums') {
      scheduleDrum(destination, step.note, time, step.accent, settings.drumsVoice);
      return;
    }
    const stepDuration = 60 / settings.bpm / settings.division;
    const gateDuration = Math.max(0.035, stepDuration * settings.gate * (step.hold || 1));
    if (step.note) {
      const noteMidi = noteToMidi(step.note);
      if (noteMidi === null) return;
      const midi = noteMidi + settings.transpose + (pitchOffset || 0);
      const frequency = midiToFrequency(midi);
      const velocity = step.accent ? 0.32 : 0.22;
      if (instrument === 'guitar') {
        scheduleGuitar(destination, frequency, time, gateDuration, velocity, settings.guitarVoice);
      } else if (instrument === 'bass') {
        scheduleBass(destination, frequency, time, gateDuration, velocity, settings.bassVoice);
      } else if (instrument === 'piano') {
        schedulePiano(destination, frequency, time, gateDuration, velocity, settings.pianoVoice);
      } else {
        scheduleLeadVoice(audio.context, destination, settings.voice, frequency, time, gateDuration, velocity);
        if (settings.bass > 0) {
          scheduleOscillator(audio.context, destination, 'triangle', frequency / 2, time, gateDuration * 0.94, settings.bass * (step.accent ? 0.3 : 0.23));
        }
        if (step.accent) scheduleNoise(audio.context, destination, time, Math.min(0.075, gateDuration), settings.noise * 0.8);
      }
    }
  }

  function queueVisualStep(index, time) {
    const delay = Math.max(0, (time - audio.context.currentTime) * 1000);
    const timer = window.setTimeout(() => highlightStep(index), delay);
    state.visualTimers.push(timer);
  }

  function highlightStep(index) {
    document.querySelectorAll('.step').forEach((card) => {
      card.classList.toggle('current', Number(card.dataset.step) === index);
    });
    const timeline = $('steps');
    const cellLeft = TRACK_LABEL_WIDTH + index * 76;
    const visibleLeft = timeline.scrollLeft + TRACK_LABEL_WIDTH;
    const visibleRight = timeline.scrollLeft + timeline.clientWidth;
    if (cellLeft < visibleLeft || cellLeft + 76 > visibleRight) {
      timeline.scrollLeft = Math.max(0, cellLeft - TRACK_LABEL_WIDTH);
    }
  }

  function clearVisuals() {
    state.visualTimers.forEach(window.clearTimeout);
    state.visualTimers.length = 0;
    document.querySelectorAll('.step.current').forEach((card) => card.classList.remove('current'));
  }

  async function ensureAudio() {
    const graph = createAudio();
    if (graph.context.state === 'suspended') await graph.context.resume();
    return graph;
  }

  async function start(looping) {
    await ensureAudio();
    stop(false);
    state.looping = looping;
    state.playOnce = !looping;
    state.currentStep = 0;
    state.cycleIndex = 0;
    state.nextNoteTime = audio.context.currentTime + 0.045;
    scheduler();
    state.timer = window.setInterval(scheduler, 25);
    $('playButton').classList.toggle('is-playing', looping);
    $('playButton').textContent = looping ? '■ Stop loop' : '▶ Play loop';
    if (looping) updateCycleStatus();
    else setStatus('Playing motif once', true);
  }

  function scheduler() {
    if (!audio || (!state.looping && !state.playOnce)) return;
    const lookAhead = audio.context.currentTime + 0.11;
    while (state.nextNoteTime < lookAhead) {
      const settings = getSettings();
      scheduleStep(state.currentStep, state.nextNoteTime, settings);
      state.nextNoteTime += 60 / settings.bpm / settings.division;
      state.currentStep++;
      if (state.currentStep >= state.length) {
        state.currentStep = 0;
        state.cycleIndex++;
        if (state.looping) updateCycleStatus();
        if (state.playOnce) {
          state.playOnce = false;
          const remaining = Math.max(0, (state.nextNoteTime - audio.context.currentTime) * 1000 + 80);
          window.setTimeout(() => stop(), remaining);
          break;
        }
      }
    }
  }

  function updateCycleStatus() {
    const track = state.tracks[state.varianceTrack];
    const variance = track.variance;
    const offset = INSTRUMENTS[track.instrument].pitched
      ? cycleTransposeOffset(variance.cycleTranspose, state.cycleIndex)
      : 0;
    const transposeText = offset === 0 ? 'base pitch' : (offset > 0 ? '+' : '') + offset + ' semitone' + (Math.abs(offset) === 1 ? '' : 's');
    setStatus(
      'Loop ' + (state.cycleIndex + 1) + ' · ' + track.name + ' · ' + transposeText +
      ' · mutation ' + Math.round(variance.noteVariance * 100) + '%' +
      ' · dropout ' + Math.round(variance.dropout * 100) + '%',
      true
    );
  }

  function stop(showStatus = true) {
    state.looping = false;
    state.playOnce = false;
    if (state.timer) window.clearInterval(state.timer);
    state.timer = 0;
    clearVisuals();
    $('playButton').classList.remove('is-playing');
    $('playButton').textContent = '▶ Play loop';
    if (showStatus) setStatus('Stopped', false);
  }

  async function auditionStep(trackIndex, index) {
    const track = state.tracks[trackIndex];
    const step = track.steps[index];
    if (!step.note) return;
    await ensureAudio();
    scheduleEvent(track.instrument, step, audio.context.currentTime + 0.012, getSettings(), audio.input);
  }

  async function auditionValue(value) {
    if (!value) return;
    await ensureAudio();
    const instrument = state.tracks[state.pickerTrack].instrument;
    scheduleEvent(
      instrument,
      { note: value, accent: false, hold: 1 },
      audio.context.currentTime + 0.012,
      getSettings(),
      audio.input
    );
  }

  function setStatus(message, live) {
    $('status').textContent = message;
    $('status').classList.toggle('live', Boolean(live));
  }

  function loadPreset(key) {
    const preset = PRESETS[key];
    if (preset.settings) {
      Object.entries(preset.settings).forEach(([id, value]) => {
        if ($(id)) $(id).value = String(value);
      });
    }
    state.length = preset.length;
    while (state.tracks.length < 4) {
      const trackIndex = state.tracks.length;
      state.tracks.push(makeTrack(trackIndex, ['lead', 'guitar', 'bass', 'drums'][trackIndex]));
    }
    if (state.tracks.length > 4) state.tracks.splice(4);
    state.steps = state.tracks[0].steps;
    ensureStepCount(preset.length);
    $('length').value = String(preset.length);
    state.tracks.forEach((track, trackIndex) => {
      track.instrument = ['lead', 'guitar', 'bass', 'drums'][trackIndex];
      track.order = trackIndex + 1;
      track.muted = false;
      track.variance = defaultVariance();
      track.steps.forEach((step) => {
        step.note = null;
        step.accent = false;
        step.hold = 1;
      });
    });
    if (preset.layers) {
      preset.layers.forEach((layer, trackIndex) => {
        const track = state.tracks[trackIndex];
        track.instrument = layer.instrument;
        track.volume = layer.volume;
        track.variance = layer.variance
          ? { ...defaultVariance(), ...layer.variance }
          : defaultVariance();
        track.steps.slice(0, preset.length).forEach((step, index) => {
          step.note = layer.notes[index] || null;
          step.accent = Boolean(layer.accents[index]);
          step.hold = layer.holds[index] || 1;
        });
      });
    } else {
      state.steps.slice(0, preset.length).forEach((step, index) => {
        step.note = preset.notes[index] || null;
        step.accent = Boolean(preset.accents[index]);
        step.hold = preset.holds ? preset.holds[index] : 1;
      });
    }
    if (preset.layerOrder) {
      preset.layerOrder.forEach((layerNumber, orderIndex) => {
        const track = state.tracks[layerNumber - 1];
        if (track) track.order = orderIndex + 1;
      });
    }
    state.varianceTrack = 0;
    buildSteps();
    syncVarianceControls();
    updateTrackMix();
    setStatus('Loaded ' + preset.name, state.looping);
  }

  function randomChoice(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  function getComposerSettings() {
    return Object.fromEntries(composerControlIds.map((id) => [
      id,
      Number($(id).value) / 100
    ]));
  }

  function updateComposerReadouts() {
    composerControlIds.forEach((id) => {
      $(id + 'Out').textContent = $(id).value + '%';
    });
  }

  function applyComposerPreset(name) {
    const preset = COMPOSER_PRESETS[name];
    if (!preset) return;
    Object.entries(preset).forEach(([id, value]) => {
      $(id).value = String(value);
    });
    updateComposerReadouts();
    setStatus('Composer profile: ' + $('composerPreset').selectedOptions[0].textContent, state.looping);
  }

  function weightedChoice(entries) {
    const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    let cursor = Math.random() * total;
    for (const entry of entries) {
      cursor -= Math.max(0, entry.weight);
      if (cursor <= 0) return entry.value;
    }
    return entries[entries.length - 1].value;
  }

  function chooseArchetype(settings) {
    return weightedChoice([
      {
        value: 'phrase',
        weight: Math.max(0, 1 - settings.riffBias - settings.echoBias)
      },
      { value: 'riff', weight: settings.riffBias },
      { value: 'sequence', weight: settings.echoBias }
    ]);
  }

  const COMPOSITION_WEIGHTS = {
    repeatTechnique: {
      sparse: 0.36,
      steady: 0.5,
      driving: 0.64
    },
    chromaticTechnique: {
      lead: 0.42,
      piano: 0.35,
      guitar: 0.26,
      bass: 0.16
    },
    chromaticPhrase: {
      lead: 0.24,
      piano: 0.2,
      guitar: 0.13,
      bass: 0.08
    },
    repeatedBeat: {
      sparse: 0.16,
      steady: 0.25,
      driving: 0.36
    },
    thirdStrike: {
      sparse: 0,
      steady: 0.05,
      driving: 0.16
    }
  };

  function chance(probability) {
    return Math.random() < Math.max(0, Math.min(1, probability));
  }

  function chooseDifferent(values, current) {
    const alternatives = values.filter((value) => value !== current);
    return randomChoice(alternatives.length ? alternatives : values);
  }

  function rhythmTemplates(instrument, density) {
    const templates = {
      sparse: {
        lead: [[true, false, true, false], [true, false, true, true], [true, true, false, false], [true, false, false, true]],
        piano: [[true, false, true, true], [true, true, false, true], [true, false, false, true], [true, true, true, false]],
        bass: [[true, true, false, true], [true, false, true, true], [true, true, true, false], [true, false, true, false]],
        guitar: [[true, false, true, true], [true, true, false, true], [true, false, true, false], [true, true, true, false]]
      },
      steady: {
        lead: [[true, true, true, true], [true, true, false, true], [true, false, true, true], [true, true, true, false]],
        piano: [[true, true, true, true], [true, false, true, true], [true, true, false, true], [true, true, true, false]],
        bass: [[true, true, true, true], [true, true, false, true], [true, false, true, true], [true, true, true, false]],
        guitar: [[true, true, true, true], [true, false, true, true], [true, true, false, true], [true, true, true, false]]
      },
      driving: {
        lead: [[true, true, true, true], [true, true, false, true], [true, false, true, true], [true, true, true, false]],
        piano: [[true, true, true, true], [true, false, true, true], [true, true, false, true], [true, true, true, false]],
        bass: [[true, true, true, true], [true, true, true, false], [true, false, true, true], [true, true, false, true]],
        guitar: [[true, true, true, true], [true, true, false, true], [true, false, true, true], [true, true, true, false]]
      }
    };
    return templates[density][instrument];
  }

  function makePhraseForms(phraseCount, settings) {
    const forms = [];
    for (let phrase = 0; phrase < phraseCount; phrase++) {
      const position = phrase % 4;
      if (phrase === 0) {
        forms.push('statement');
      } else if (position === 3 || phrase === phraseCount - 1) {
        forms.push('cadence');
      } else if (position === 2) {
        forms.push(chance(0.2 + settings.development * 0.75) ? 'contrast' : 'return');
      } else if (chance(0.62 - settings.development * 0.55)) {
        forms.push('return');
      } else {
        forms.push('answer');
      }
    }
    return forms;
  }

  function makeProgression(phraseCount, settings) {
    const progressions = [
      [0, -2, -5, -1],
      [0, 3, -2, -1],
      [0, -5, -2, 1],
      [0, 1, -2, -1],
      [0, 0, 3, -1]
    ];
    const progression = randomChoice(progressions);
    const secondSectionShift = chance(settings.development)
      ? randomChoice([-2, 0, 3])
      : 0;
    return Array.from({ length: phraseCount }, (_, phrase) => {
      const sectionShift = phrase >= 4 ? secondSectionShift : 0;
      return progression[phrase % progression.length] + sectionShift;
    });
  }

  function transformPitchCell(baseCell, form, harmonicOffset, instrument) {
    const cell = baseCell.slice();
    if (form === 'answer') {
      cell[2] += randomChoice([-2, 1, 3]);
      cell[3] += randomChoice([-1, 1, 3]);
    } else if (form === 'contrast') {
      const pivot = cell[1];
      cell[0] = pivot;
      cell[1] = baseCell[3];
      cell[2] = baseCell[0] + randomChoice([1, 3, 6]);
      cell[3] = baseCell[2];
    } else if (form === 'cadence') {
      cell[1] = baseCell[1] + randomChoice([-1, 1]);
      cell[2] = baseCell[3] + randomChoice([-2, 1]);
      cell[3] = instrument === 'lead' || instrument === 'piano'
        ? 24
        : 0;
    }
    return cell.map((interval) => interval + harmonicOffset);
  }

  function buildInstrumentPlan(instrument, density, phraseCount, forms, progression, baseCell, settings) {
    const rhythmChoices = rhythmTemplates(instrument, density);
    const baseRhythm = randomChoice(rhythmChoices);
    const pitches = [];
    const rhythms = [];
    const repeats = [];
    const thirdStrikes = [];
    const chromaticTargets = [];
    const ornamentScale = settings.ornaments / 0.35;
    const useRepeatedAttacks = chance(
      COMPOSITION_WEIGHTS.repeatTechnique[density] * ornamentScale
    );
    const useChromaticApproaches = chance(
      COMPOSITION_WEIGHTS.chromaticTechnique[instrument] * ornamentScale
    );

    for (let phrase = 0; phrase < phraseCount; phrase++) {
      const form = forms[phrase];
      pitches.push(transformPitchCell(baseCell, form, progression[phrase], instrument));

      const shouldVaryRhythm = form === 'contrast' ||
        (form !== 'return' && chance(0.12 + settings.development * 0.5));
      rhythms.push(shouldVaryRhythm
        ? chooseDifferent(rhythmChoices, baseRhythm)
        : baseRhythm.slice());

      const phraseRepeats = [false, false, false, false];
      const phraseThirdStrikes = [false, false, false, false];
      for (let beat = 0; beat < 4; beat++) {
        phraseRepeats[beat] = useRepeatedAttacks && chance(
          COMPOSITION_WEIGHTS.repeatedBeat[density] * (0.45 + settings.ornaments)
        );
        phraseThirdStrikes[beat] = phraseRepeats[beat] &&
          chance(COMPOSITION_WEIGHTS.thirdStrike[density]);
      }
      repeats.push(phraseRepeats);
      thirdStrikes.push(phraseThirdStrikes);

      const chromaticChance = COMPOSITION_WEIGHTS.chromaticPhrase[instrument] *
        (0.45 + settings.ornaments);
      chromaticTargets.push(useChromaticApproaches && chance(chromaticChance)
        ? randomChoice([1, 2, 3])
        : null);
    }

    return { pitches, rhythms, repeats, thirdStrikes, chromaticTargets };
  }

  function makeIdentityContour(count, instrument, settings) {
    const bassLike = instrument === 'bass';
    const lowerBound = bassLike ? -7 : -5;
    const upperBound = bassLike ? 7 : 12;
    const leapPool = bassLike
      ? [3, 5, 7]
      : [5, 6, 7, 10, ...(chance(settings.leaps) ? [12] : [])];
    const pickup = chance(0.48)
      ? [0, 0]
      : [0, randomChoice([-1, 1, 3])];
    const leapDirection = bassLike || chance(0.82) ? 1 : -1;
    const contour = [...pickup, randomChoice(leapPool) * leapDirection];
    let current = contour[contour.length - 1];
    const cadenceChoices = bassLike
      ? [[0, -2, 0], [-5, -2, 0], [3, 1, 0], [0, 3, -2]]
      : [[0, 3, 5], [5, 3, 0], [3, 1, 0], [-2, 0, 3], [6, 5, 3]];
    const cadence = randomChoice(cadenceChoices);
    while (contour.length < Math.max(3, count - cadence.length)) {
      const repeatChance = 0.08 + settings.ornaments * 0.18;
      const movement = chance(repeatChance)
        ? 0
        : randomChoice([-3, -2, -1, 1, 2]);
      current = Math.max(lowerBound, Math.min(upperBound, current + movement));
      contour.push(current);
    }
    return [...contour, ...cadence].slice(0, count);
  }

  function makeRiffEvents(instrument, division, settings, density) {
    const onsetTemplates = {
      sparse: [
        [0, 0.5, 1.5, 2.5, 3.5, 4.5, 6, 7, 7.5],
        [0, 1, 1.5, 3, 4, 5, 6.5, 7.5]
      ],
      steady: [
        [0, 0.5, 1, 1.5, 2.5, 3, 4, 4.5, 5.5, 6.5, 7, 7.5],
        [0, 0.5, 1.5, 2, 2.5, 3.5, 4.5, 5, 6, 6.5, 7.5],
        [0, 1, 1.5, 2, 3, 3.5, 4, 5, 5.5, 6.5, 7, 7.5],
        [0, 0.5, 1, 2, 2.5, 3, 4.5, 5, 5.5, 6.5, 7.5]
      ],
      driving: [
        [0, 0.5, 1, 1.5, 2, 2.5, 3.5, 4, 4.5, 5, 5.5, 6.5, 7, 7.5],
        [0, 0.5, 1, 1.5, 2.5, 3, 3.5, 4, 4.5, 5.5, 6, 6.5, 7, 7.5],
        [0, 0.5, 1.5, 2, 2.5, 3, 3.5, 4.5, 5, 5.5, 6, 7, 7.5]
      ]
    };
    const straightTemplates = {
      sparse: [0, 1, 2, 3, 4, 5, 6, 7],
      steady: [0, 0.5, 1, 2, 2.5, 3, 4, 5, 6, 7, 7.5],
      driving: [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6, 7, 7.5]
    };
    const beatOffsets = (chance(settings.syncopation)
      ? randomChoice(onsetTemplates[density])
      : straightTemplates[density]).slice();
    if (chance(settings.development * 0.7) && beatOffsets.length > 5) {
      const movableIndex = 2 + Math.floor(Math.random() * (beatOffsets.length - 3));
      const shifted = beatOffsets[movableIndex] + randomChoice([-0.5, 0.5]);
      if (shifted > beatOffsets[movableIndex - 1] &&
        shifted < beatOffsets[movableIndex + 1]) {
        beatOffsets[movableIndex] = shifted;
      }
    }
    const cellSteps = Math.max(1, division * 8);
    const offsets = [...new Set(beatOffsets.map((beat) => Math.min(
      cellSteps - 1,
      Math.max(0, Math.round(beat * division))
    )))];
    const register = instrument === 'lead'
      ? 12
      : instrument === 'piano' ? 24 : 0;
    const pitchCell = makeIdentityContour(offsets.length, instrument, settings);
    const anchorDescent = randomChoice([
      [0, -2, -3, -4],
      [0, -2, -5, -1],
      [0, -1, -3, -5],
      [0, 3, -2, -1],
      [0, 0, -2, 1]
    ]);
    const events = [];

    for (let cellStart = 0, cycle = 0; cellStart < state.length; cellStart += cellSteps, cycle++) {
      offsets.forEach((offset, eventIndex) => {
        let step = cellStart + offset;
        if (step >= state.length) return;
        let interval = register + pitchCell[eventIndex];
        if (eventIndex < 2) {
          interval += anchorDescent[cycle % anchorDescent.length];
        } else if (cycle > 0 && chance(1 - settings.motifLock)) {
          interval += randomChoice([-2, -1, 1, 3]);
        }
        if (cycle > 0 && chance((1 - settings.motifLock) * settings.syncopation) &&
          step + 1 < Math.min(state.length, cellStart + cellSteps)) {
          step += 1;
        }
        const nextOffset = offsets[eventIndex + 1] === undefined
          ? cellSteps
          : offsets[eventIndex + 1];
        const available = Math.max(1, nextOffset - offset);
        const hold = Math.max(1, Math.min(
          available,
          Math.round(available * (0.15 + settings.sustain * 0.45))
        ));
        events.push({
          step,
          interval,
          hold,
          accent: eventIndex === 0
        });
      });
    }
    return events;
  }

  function makeSequenceEvents(instrument, division, settings, density) {
    const spacingPatterns = {
      sparse: [
        [0.5, 0.75, 0.5, 1, 0.5, 0.75],
        [0.75, 0.5, 1, 0.5, 0.75, 0.5]
      ],
      steady: [
        [0.25, 0.5, 0.25, 0.75, 0.5, 0.25, 0.5],
        [0.5, 0.25, 0.5, 0.25, 0.75, 0.25, 0.5],
        [0.25, 0.25, 0.5, 0.75, 0.25, 0.5, 0.5]
      ],
      driving: [
        [0.25, 0.25, 0.5, 0.25, 0.25, 0.5, 0.25, 0.5],
        [0.25, 0.5, 0.25, 0.25, 0.5, 0.25, 0.25, 0.5]
      ]
    };
    const straightPatterns = {
      sparse: [1, 0.5, 1, 0.5],
      steady: [0.5, 0.5, 0.5, 0.5],
      driving: [0.25, 0.25, 0.5, 0.25, 0.25, 0.5]
    };
    const spacingBeats = chance(settings.syncopation)
      ? randomChoice(spacingPatterns[density])
      : straightPatterns[density];
    const spacings = spacingBeats.map((beats) => Math.max(1, Math.round(beats * division)));
    const register = instrument === 'lead'
      ? (chance(settings.leaps * 0.55) ? 36 : 24)
      : instrument === 'piano'
        ? 24
        : instrument === 'bass' ? 0 : 12;
    const pitchCell = makeIdentityContour(spacings.length, instrument, settings);
    const sectionShift = chance(settings.development)
      ? randomChoice([-2, 1, 3])
      : 0;
    const events = [];
    let step = 0;
    let eventIndex = 0;

    while (step < state.length) {
      const cycle = Math.floor(eventIndex / pitchCell.length);
      const spacing = spacings[eventIndex % spacings.length];
      let interval = register + pitchCell[eventIndex % pitchCell.length];
      if (cycle % 2 === 1) interval += sectionShift;
      if (cycle > 1 && chance(settings.development * 0.35)) {
        interval += randomChoice([-2, 1, 3]);
      }
      events.push({
        step,
        interval,
        hold: Math.max(1, Math.round(spacing * (0.2 + settings.sustain * 0.55))),
        accent: eventIndex % pitchCell.length === 0
      });
      step += spacing;
      eventIndex++;
    }
    return events;
  }

  function makeRandomContext(root) {
    const composer = getComposerSettings();
    const archetype = chooseArchetype(composer);
    const turn = randomChoice([1, 3, 6, ...(chance(composer.leaps) ? [12] : [])]);
    const answer = randomChoice([3, 6, 7, 10, ...(chance(composer.leaps) ? [12] : [])]);
    const guitarTurn = randomChoice([1, 3, 5]);
    const guitarTension = randomChoice([6, 7, 10]);
    const guitarAnswer = randomChoice([-1, 1, 3, 5]);
    const shape = Math.floor(Math.random() * 4);
    const leadShapes = [
      [24, 24, 24 + turn, 24 + answer],
      [24, 24 + turn, 24 + turn, 24 + answer],
      [24 + answer, 24 + answer, 24 + turn, 24],
      [24, 24 + turn, 24, 24 + answer]
    ];
    const pianoShapes = [
      [24, 24 + turn, 24, 24 + answer],
      [24, 24, 24 + answer, 24 + turn],
      [24 + turn, 24 + turn, 24, 24 + answer],
      [24 + answer, 24, 24 + turn, 24]
    ];
    const bassTurn = randomChoice([1, 3, 5, 6]);
    const bassAnswer = randomChoice([-1, 0, 1, 6, 10]);
    const bassShapes = [
      [0, 0, bassTurn, bassAnswer],
      [0, bassTurn, 0, bassAnswer],
      [0, 0, bassAnswer, bassTurn],
      [bassTurn, bassTurn, 0, bassAnswer]
    ];
    const guitarShapes = [
      [0, guitarTurn, guitarTension, guitarAnswer],
      [0, 0, guitarTurn, guitarTension],
      [0, guitarTension, 0, guitarAnswer],
      [guitarTurn, guitarTurn, 0, guitarTension]
    ];
    const drumPatterns = [
      ['KICK', 'SNARE', 'KICK', 'SNARE'],
      ['KICK', 'KICK', 'SNARE', 'KICK'],
      ['KICK', 'SNARE', 'KICK', 'KICK'],
      ['KICK', 'KICK', 'KICK', 'SNARE']
    ];
    const division = Math.max(1, Number($('division').value));
    const phraseCount = Math.max(1, Math.ceil(state.length / division / 4));
    const density = $('randomDensity').value;
    const forms = makePhraseForms(phraseCount, composer);
    const progression = makeProgression(phraseCount, composer);
    const baseCells = {
      lead: leadShapes[shape],
      piano: pianoShapes[(shape + Math.floor(Math.random() * 3)) % pianoShapes.length],
      bass: bassShapes[(shape + Math.floor(Math.random() * 3)) % bassShapes.length],
      guitar: guitarShapes[(shape + Math.floor(Math.random() * 3)) % guitarShapes.length]
    };
    const plans = {};
    Object.keys(baseCells).forEach((instrument) => {
      plans[instrument] = buildInstrumentPlan(
        instrument,
        density,
        phraseCount,
        forms,
        progression,
        baseCells[instrument],
        composer
      );
    });
    const baseDrumPattern = randomChoice(drumPatterns);
    const drumPlans = forms.map((form) => {
      if (form === 'statement' || form === 'return') return baseDrumPattern.slice();
      return form === 'cadence'
        ? ['KICK', 'SNARE', 'KICK', 'SNARE']
        : chooseDifferent(drumPatterns, baseDrumPattern).slice();
    });
    const eventPlans = {};
    if (archetype === 'riff' || archetype === 'sequence') {
      Object.keys(baseCells).forEach((instrument) => {
        eventPlans[instrument] = archetype === 'riff'
          ? makeRiffEvents(instrument, division, composer, density)
          : makeSequenceEvents(instrument, division, composer, density);
      });
    }
    return {
      root: root === undefined ? randomChoice([36, 38, 40, 41, 43, 45]) : root,
      density,
      archetype,
      composer,
      forms,
      progression,
      plans,
      eventPlans,
      drumPlans,
      hatOffset: Math.floor(Math.random() * 2),
      syncopation: randomChoice([
        [false, false, false, false],
        [false, true, false, false],
        [false, false, false, true],
        [false, true, false, true]
      ])
    };
  }

  function inferCurrentRoot() {
    const preferred = ['bass', 'guitar', 'piano', 'lead'];
    for (const instrument of preferred) {
      const track = state.tracks.find((candidate) => candidate.instrument === instrument);
      const event = track && track.steps.slice(0, state.length).find((step) => step.note);
      const midi = event && noteToMidi(event.note);
      if (midi !== null && midi !== false && midi !== undefined) {
        return 36 + ((midi % 12) + 12) % 12;
      }
    }
    return undefined;
  }

  function clearTrack(track) {
    track.steps.forEach((step) => {
      step.note = null;
      step.accent = false;
      step.hold = 1;
    });
  }

  function randomizeTrackData(trackIndex, context) {
    const track = state.tracks[trackIndex];
    const division = Math.max(1, Number($('division').value));
    clearTrack(track);

    if (track.instrument !== 'drums' && context.eventPlans[track.instrument]) {
      context.eventPlans[track.instrument].forEach((event) => {
        if (event.step < 0 || event.step >= state.length) return;
        const step = track.steps[event.step];
        step.note = midiToNote(context.root + event.interval);
        step.accent = event.accent;
        step.hold = Math.max(1, Math.min(16, event.hold));
      });
      return;
    }

    if (track.instrument === 'drums') {
      if (context.archetype === 'riff') {
        for (let start = 0, beat = 0; start < state.length; start += division, beat++) {
          const phraseBeat = beat % 4;
          track.steps[start].note = phraseBeat === 1 || phraseBeat === 3
            ? 'SNARE'
            : 'KICK';
          track.steps[start].accent = beat % 4 === 0;
          if (division > 1 && (context.density !== 'sparse' || beat % 2 === 0)) {
            const hatStep = start + Math.max(1, Math.floor(division / 2));
            if (hatStep < state.length) track.steps[hatStep].note = 'HAT';
          }
          if (phraseBeat === 3 && beat % 8 === 7 && start + division - 1 < state.length) {
            track.steps[start + division - 1].note = 'TOM';
          }
        }
        return;
      }
      if (context.archetype === 'sequence') {
        for (let start = 0, beat = 0; start < state.length; start += division, beat++) {
          if (beat % 4 === 0) {
            track.steps[start].note = 'KICK';
            track.steps[start].accent = true;
          } else if (beat % 4 === 2) {
            track.steps[start].note = 'SNARE';
          } else if (context.density === 'driving') {
            track.steps[start].note = 'HAT';
          }
        }
        return;
      }
      for (let start = 0, beat = 0; start < state.length; start += division, beat++) {
        const phrase = Math.floor(beat / 4);
        const phraseBeat = beat % 4;
        const downbeat = track.steps[start];
        const drumPattern = context.drumPlans[phrase] || context.drumPlans[0];
        downbeat.note = drumPattern[phraseBeat];
        downbeat.accent = beat % 4 === 0;
        const addHat = context.density === 'driving' ||
          (context.density === 'steady' && (phraseBeat + context.hatOffset) % 2 === 0);
        if (addHat && division > 1 && start + Math.floor(division / 2) < state.length) {
          track.steps[start + Math.floor(division / 2)].note = 'HAT';
        }
        if (phraseBeat === 3 && phrase % 2 === 1 && start + division - 1 < state.length) {
          track.steps[start + division - 1].note = context.forms[phrase] === 'cadence'
            ? 'TOM'
            : 'OPEN_HAT';
        } else if (context.density === 'driving' && division > 2 &&
          phraseBeat !== 3 && start + division - 1 < state.length) {
          track.steps[start + division - 1].note = 'KICK';
        }
      }
      return;
    }

    const plan = context.plans[track.instrument] || context.plans.lead;

    for (let start = 0, beat = 0; start < state.length; start += division, beat++) {
      const phrase = Math.floor(beat / 4);
      const phraseBeat = beat % 4;
      const phrasePitches = plan.pitches[phrase] || plan.pitches[0];
      const phraseRhythm = plan.rhythms[phrase] || plan.rhythms[0];
      if (!phraseRhythm[phraseBeat]) continue;
      const interval = phrasePitches[phraseBeat];
      const midi = context.root + interval;
      const attackIndex = division >= 4 && context.syncopation[phraseBeat]
        ? start + 1
        : start;
      const first = track.steps[attackIndex];
      first.note = midiToNote(midi);
      first.accent = phraseBeat === 0;
      first.hold = track.instrument === 'piano' ? Math.min(2, division) : 1;

      const repeatIndex = attackIndex + 1;
      if (plan.repeats[phrase][phraseBeat] &&
        repeatIndex < start + division && repeatIndex < state.length) {
        track.steps[repeatIndex].note = first.note;
        track.steps[repeatIndex].accent = false;
        track.steps[repeatIndex].hold = 1;
      }
      const driveIndex = attackIndex + 2;
      if (plan.thirdStrikes[phrase][phraseBeat] &&
        driveIndex < start + division && driveIndex < state.length) {
        track.steps[driveIndex].note = first.note;
        track.steps[driveIndex].hold = 1;
      }
    }

    if (division > 1) {
      plan.chromaticTargets.forEach((targetBeat, phrase) => {
        if (targetBeat === null) return;
        const targetIndex = (phrase * 4 + targetBeat) * division;
        const approachIndex = targetIndex - 1;
        if (targetIndex >= state.length || approachIndex < 0 ||
          track.steps[approachIndex].note) return;
        const targetNote = track.steps[targetIndex].note;
        const targetMidi = targetNote && noteToMidi(targetNote);
        if (targetMidi === null || targetMidi === false || targetMidi === undefined) return;
        track.steps[approachIndex].note = midiToNote(targetMidi + randomChoice([-1, 1]));
        track.steps[approachIndex].accent = false;
        track.steps[approachIndex].hold = 1;
      });
    }
  }

  const BANK_CONTROL_BY_INSTRUMENT = {
    lead: 'voice',
    guitar: 'guitarVoice',
    bass: 'bassVoice',
    piano: 'pianoVoice',
    drums: 'drumsVoice'
  };

  function randomizeBankVoice(instrument) {
    const select = $(BANK_CONTROL_BY_INSTRUMENT[instrument]);
    if (!select) return;
    const alternatives = Array.from(select.options)
      .map((option) => option.value)
      .filter((value) => value !== select.value);
    if (alternatives.length) select.value = randomChoice(alternatives);
  }

  function applyArchetypeSound(context) {
    if (context.archetype === 'riff') {
      $('gate').value = String(Math.round(48 + context.composer.sustain * 28));
      $('echo').value = String(Math.round(4 + context.composer.sustain * 12));
      $('echoRate').value = '0.5';
    } else if (context.archetype === 'sequence') {
      $('gate').value = String(Math.round(58 + context.composer.sustain * 32));
      $('echo').value = String(Math.round(8 + context.composer.sustain * 22));
      $('echoRate').value = randomChoice(['0.25', '0.5', '0.75']);
    }
  }

  function randomizeTrack(trackIndex) {
    ensureStepCount(state.length);
    const track = state.tracks[trackIndex];
    const context = makeRandomContext(inferCurrentRoot());
    randomizeTrackData(trackIndex, context);
    randomizeBankVoice(track.instrument);
    syncSteps();
    updateReadouts();
    setStatus(
      'Randomized ' + track.name + ' · ' + context.archetype + ' writing',
      state.looping
    );
  }

  function randomizeAll() {
    ensureStepCount(state.length);
    const context = makeRandomContext();
    state.tracks.forEach((track, trackIndex) => {
      randomizeTrackData(trackIndex, context);
    });
    applyArchetypeSound(context);
    Object.keys(BANK_CONTROL_BY_INSTRUMENT).forEach(randomizeBankVoice);
    syncSteps();
    updateReadouts();
    setStatus(
      'Generated ' + context.archetype + ' motif across ' +
        state.tracks.length + ' layers',
      state.looping
    );
  }

  function midiToNote(midi) {
    return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }

  function resetSound() {
    Object.entries(DEFAULT_SOUND).forEach(([key, value]) => {
      if ($(key)) $(key).value = String(value);
    });
    state.length = 10;
    $('length').value = '10';
    loadPreset('grave');
    setStatus('Sound controls reset', state.looping);
  }

  function updateConfigPreview() {
    if (!$('configPreview')) return;
    $('configPreview').textContent = 'const BOSS_MOTIF = ' + JSON.stringify(getConfig(), null, 2) + ';\n\n' +
      '// layerOrder contains 1-based layer numbers in their intended entrance order.\n' +
      '// At runtime, note seconds = (60 / currentCombatBpm) * BOSS_MOTIF.stepBeats;\n' +
      '// Call your future music player\'s setBpm(currentCombatBpm) whenever combat BPM changes.';
  }

  async function copyConfig(asJavaScript) {
    const config = JSON.stringify(getConfig(), null, 2);
    const text = asJavaScript ? 'const BOSS_MOTIF = ' + config + ';' : config;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(asJavaScript ? 'JS config copied' : 'JSON copied', state.looping);
    } catch (error) {
      $('configPreview').textContent = text;
      document.querySelector('details').open = true;
      setStatus('Clipboard blocked — config shown below', state.looping);
    }
  }

  function drawScope() {
    const canvas = $('scope');
    const context = canvas.getContext('2d');
    const samples = new Uint8Array(audio.analyser.fftSize);

    function frame() {
      const width = Math.max(1, Math.floor(canvas.clientWidth / 2));
      const height = Math.max(1, Math.floor(canvas.clientHeight / 2));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      audio.analyser.getByteTimeDomainData(samples);
      context.fillStyle = '#020102';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = '#36101a';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, Math.floor(height / 2) + 0.5);
      context.lineTo(width, Math.floor(height / 2) + 0.5);
      context.stroke();
      context.strokeStyle = '#ff493f';
      context.beginPath();
      for (let x = 0; x < width; x++) {
        const sample = samples[Math.floor(x / width * samples.length)] / 255;
        const y = Math.round(sample * height);
        if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
      window.requestAnimationFrame(frame);
    }
    frame();
  }

  buildNotePicker();
  buildDrumPicker();
  buildSteps();
  loadPreset('grave');
  updateComposerReadouts();

  controlIds.forEach((id) => {
    $(id).addEventListener('input', () => {
      updateReadouts();
      if (id === 'division') buildSteps();
    });
  });

  $('varianceLayer').addEventListener('change', () => {
    state.varianceTrack = Number($('varianceLayer').value);
    syncVarianceControls();
    if (state.looping) updateCycleStatus();
  });

  varianceControlIds.forEach((id) => {
    $(id).addEventListener('input', saveVarianceControls);
  });

  $('composerPreset').addEventListener('change', () => {
    if ($('composerPreset').value !== 'custom') {
      applyComposerPreset($('composerPreset').value);
    }
  });
  composerControlIds.forEach((id) => {
    $(id).addEventListener('input', () => {
      $('composerPreset').value = 'custom';
      updateComposerReadouts();
    });
  });

  $('length').addEventListener('change', () => setLength($('length').value));
  $('length').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      setLength($('length').value);
      $('length').blur();
    }
  });
  $('removeStep').addEventListener('click', () => setLength(state.length - 1));
  $('addStep').addEventListener('click', () => setLength(state.length + 1));
  $('addLayer').addEventListener('click', addLayer);

  $('playButton').addEventListener('click', () => state.looping ? stop() : start(true));
  $('onceButton').addEventListener('click', () => start(false));
  $('panicButton').addEventListener('click', () => stop());
  $('loadPreset').addEventListener('click', () => loadPreset($('preset').value));
  $('randomize').addEventListener('click', randomizeAll);
  $('copyJson').addEventListener('click', () => copyConfig(false));
  $('copyJs').addEventListener('click', () => copyConfig(true));
  $('reset').addEventListener('click', resetSound);
  $('closeNotePicker').addEventListener('click', closeNotePicker);
  $('chooseRest').addEventListener('click', () => selectPickerNote(null));
  $('notePickerOverlay').addEventListener('click', (event) => {
    if (event.target === $('notePickerOverlay')) closeNotePicker();
  });

  document.addEventListener('keydown', (event) => {
    const tag = event.target && event.target.tagName;
    if (event.code === 'Space' && tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'BUTTON') {
      event.preventDefault();
      state.looping ? stop() : start(true);
    }
    if (event.code === 'Escape') {
      if (!$('notePickerOverlay').hidden) closeNotePicker();
      else stop();
    }
  });

  window.addEventListener('beforeunload', () => stop(false));
}());
