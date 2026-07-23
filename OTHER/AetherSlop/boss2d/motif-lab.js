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
      layers: [
        arrangedLayer('lead', 16, [
          [0, 'C#5'], [4, 'C5'], [7, 'G4'], [8, 'C#5'], [13, 'D5'], [15, 'G#4']
        ], [0, 8, 15], [[0, 4], [4, 2], [8, 4], [13, 2]], 72, {
          cycleTranspose: 'rise', noteVariance: 0.03, varianceRange: 1, dropout: 0.04
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
        bpm: 100, division: 4, gate: 72, voice: 'warblePulse', transpose: 0,
        bits: 4, drive: 48, cutoff: 2000, bass: 0, noise: 3, echo: 38,
        echoRate: 0.75
      }
    }
  };

  const DEFAULT_SOUND = {
    bpm: 150, division: 2, gate: 72, voice: 'pulse25', transpose: 0,
    bits: 6, drive: 32, cutoff: 2600, bass: 24, noise: 11, echo: 18,
    echoRate: 0.75
  };

  const INSTRUMENTS = {
    lead: { label: 'Lead chip', pitched: true },
    guitar: { label: 'Metal guitar', pitched: true },
    bass: { label: 'Bass', pitched: true },
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
      volume: instrument === 'bass' ? 70 : instrument === 'drums' ? 76 : 82,
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
    'bpm', 'division', 'gate', 'voice', 'transpose', 'bits', 'drive',
    'cutoff', 'bass', 'noise', 'echo', 'echoRate'
  ];
  const varianceControlIds = ['loopTranspose', 'noteVariance', 'varianceRange', 'dropout'];
  const HOLD_VALUES = [1, 2, 3, 4, 6, 8, 12, 16];

  function ensureStepCount(count) {
    state.tracks.forEach((track) => {
      while (track.steps.length < count) track.steps.push(emptyStep());
    });
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
    const columns = '150px repeat(' + state.length + ', 76px)';
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
    state.tracks.forEach((track, trackIndex) => {
      const option = select.options[trackIndex];
      if (option) option.textContent = track.name + ' \u2014 ' + INSTRUMENTS[track.instrument].label;
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
    name.appendChild(mute);

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
    label.append(name, instrument, volume);
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
    input.connect(crusher).connect(drive).connect(filter);
    filter.connect(dry).connect(master);
    filter.connect(delay).connect(wet).connect(master);
    delay.connect(feedback).connect(delay);
    master.connect(compressor).connect(analyser).connect(context.destination);

    audio = { context, input, crusher, drive, filter, dry, delay, feedback, wet, master, analyser, trackGains };
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
    const k = 1 + amount * 75;
    for (let i = 0; i < size; i++) {
      const x = i / (size - 1) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
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

  function updateTrackMix() {
    if (!audio) return;
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

  function scheduleGuitar(destination, frequency, time, duration, velocity) {
    const context = audio.context;
    scheduleOscillator(context, destination, 'sawtooth', frequency, time, duration, velocity * 0.48, { detune: -5 });
    scheduleOscillator(context, destination, 'square', frequency, time, duration * 0.96, velocity * 0.28, { detune: 5 });
    scheduleOscillator(context, destination, 'pulse18', frequency * 1.4983, time, duration * 0.88, velocity * 0.23);
    scheduleOscillator(context, destination, 'pulse12', frequency * 2, time, duration * 0.72, velocity * 0.15);
  }

  function scheduleBass(destination, frequency, time, duration, velocity) {
    const context = audio.context;
    scheduleOscillator(context, destination, 'triangle', frequency, time, duration, velocity * 0.82);
    scheduleOscillator(context, destination, 'pulse12', frequency, time, duration * 0.78, velocity * 0.22);
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
      return;
    }
    if (drum === 'SNARE') {
      scheduleFilteredNoise(destination, time, 0.15, 0.42 * strength, 'bandpass', 1800, 0.7);
      scheduleOscillator(context, destination, 'triangle', 175, time, 0.09, 0.13 * strength);
      return;
    }
    if (drum === 'HAT') {
      scheduleFilteredNoise(destination, time, 0.055, 0.2 * strength, 'highpass', 5200, 0.8);
      return;
    }
    if (drum === 'OPEN_HAT') {
      scheduleFilteredNoise(destination, time, 0.25, 0.18 * strength, 'highpass', 4300, 0.7);
      return;
    }
    if (drum === 'TOM') {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(190, time);
      oscillator.frequency.exponentialRampToValueAtTime(82, time + 0.18);
      gain.gain.setValueAtTime(0.38 * strength, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
      oscillator.connect(gain).connect(destination);
      oscillator.start(time);
      oscillator.stop(time + 0.28);
      return;
    }
    if (drum === 'CRASH') {
      scheduleFilteredNoise(destination, time, 0.65, 0.24 * strength, 'highpass', 2600, 0.5);
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
      scheduleDrum(destination, step.note, time, step.accent);
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
        scheduleGuitar(destination, frequency, time, gateDuration, velocity);
      } else if (instrument === 'bass') {
        scheduleBass(destination, frequency, time, gateDuration, velocity);
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
    const cellLeft = 150 + index * 76;
    const visibleLeft = timeline.scrollLeft + 150;
    const visibleRight = timeline.scrollLeft + timeline.clientWidth;
    if (cellLeft < visibleLeft || cellLeft + 76 > visibleRight) {
      timeline.scrollLeft = Math.max(0, cellLeft - 150);
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
    ensureStepCount(preset.length);
    $('length').value = String(preset.length);
    state.tracks.forEach((track, trackIndex) => {
      track.instrument = ['lead', 'guitar', 'bass', 'drums'][trackIndex];
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
    state.varianceTrack = 0;
    buildSteps();
    syncVarianceControls();
    updateTrackMix();
    setStatus('Loaded ' + preset.name, state.looping);
  }

  function randomize() {
    ensureStepCount(state.length);
    const roots = [38, 40, 41, 43, 45]; // D2, E2, F2, G2, A2
    const root = roots[Math.floor(Math.random() * roots.length)];
    const darkIntervals = [0, 1, 3, 5, 6, 7, 10, 12, 13, 15];
    for (let i = 0; i < state.length; i++) {
      const rest = i > 0 && Math.random() < 0.1;
      let midi = root + darkIntervals[Math.floor(Math.random() * darkIntervals.length)];
      if (i === 0 || i === state.length - 1) midi = root + (Math.random() < 0.7 ? 12 : 0);
      state.steps[i].note = rest ? null : midiToNote(midi);
      state.steps[i].accent = i === 0 || Math.random() < 0.25;
      state.steps[i].hold = 1;
    }
    syncSteps();
    updateConfigPreview();
    setStatus('Generated a new dark motif', state.looping);
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

  $('length').addEventListener('change', () => setLength($('length').value));
  $('length').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      setLength($('length').value);
      $('length').blur();
    }
  });
  $('removeStep').addEventListener('click', () => setLength(state.length - 1));
  $('addStep').addEventListener('click', () => setLength(state.length + 1));

  $('playButton').addEventListener('click', () => state.looping ? stop() : start(true));
  $('onceButton').addEventListener('click', () => start(false));
  $('panicButton').addEventListener('click', () => stop());
  $('loadPreset').addEventListener('click', () => loadPreset($('preset').value));
  $('randomize').addEventListener('click', randomize);
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
