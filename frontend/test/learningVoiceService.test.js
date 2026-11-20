import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpeechInputProvider,
  createSpeechOutputProvider,
  getVoiceProfileChoices,
} from "../src/services/learningVoiceService.js";

test("speech input provider requests English transcription and returns recognized text", () => {
  let recognition;
  class MockRecognition {
    constructor() {
      recognition = this;
    }
    start() {}
    stop() {}
  }
  const provider = createSpeechInputProvider({ SpeechRecognition: MockRecognition });
  let transcript = "";
  let interimTranscript = "";
  provider.start({
    language: "ta",
    onTranscript: (value) => { transcript = value; },
    onInterim: (value) => { interimTranscript = value; },
    onError: () => assert.fail("Unexpected recognition error"),
  });
  assert.equal(recognition.lang, "en-US");
  recognition.onresult({
    resultIndex: 0,
    results: [{ isFinal: false, 0: { transcript: "My code is " } }],
  });
  assert.equal(interimTranscript, "My code is ");
  recognition.onresult({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: "My code is not working." } }],
  });
  assert.equal(transcript, "My code is not working.");
});

test("desktop speech input captures microphone audio, resamples it, and transcribes locally", async () => {
  let processor;
  let transcriptionRequest;
  let transcriptionCalls = 0;
  let stoppedTracks = 0;
  const states = [];
  const track = { stop: () => { stoppedTracks += 1; } };
  class MockAudioContext {
    constructor(options) {
      assert.deepEqual(options, { sampleRate: 16000 });
      this.sampleRate = 48000;
      this.state = "running";
      this.destination = {};
    }
    async resume() {}
    async close() {
      this.state = "closed";
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createScriptProcessor() {
      processor = { connect() {}, disconnect() {}, onaudioprocess: null };
      return processor;
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
  }
  const provider = createSpeechInputProvider({
    AudioContext: MockAudioContext,
    navigator: {
      mediaDevices: {
        getUserMedia: async (constraints) => {
          assert.equal(constraints.audio.channelCount, 1);
          assert.deepEqual(constraints.audio.sampleRate, { ideal: 16000 });
          assert.equal(constraints.audio.echoCancellation, true);
          assert.equal(constraints.audio.noiseSuppression, true);
          assert.equal(constraints.audio.autoGainControl, true);
          return { getTracks: () => [track] };
        },
      },
    },
    codeClashDesktop: {
      speech: {
        transcribe: async (request) => {
          transcriptionCalls += 1;
          transcriptionRequest = request;
          return "  What is a variable?  ";
        },
      },
    },
  });
  let transcript = "";
  const stop = await provider.start({
    language: "ta",
    onTranscript: (value) => { transcript = value; },
    onError: (error) => assert.fail(error),
    onStateChange: (state) => states.push(state),
  });
  processor.onaudioprocess({
    inputBuffer: { getChannelData: () => new Float32Array(48000 * 31).fill(0.25) },
  });
  await stop();
  await stop();

  assert.equal(transcriptionRequest.sampleRate, 16000);
  assert.equal(transcriptionRequest.samples.length, 16000 * 31);
  assert.equal(transcriptionRequest.samples[0], 0.25);
  assert.equal(transcriptionRequest.language, "en");
  assert.equal(transcriptionCalls, 1);
  assert.equal(transcript, "What is a variable?");
  assert.equal(stoppedTracks, 1);
  assert.deepEqual(states, ["requesting", "recording", "transcribing", "idle"]);
});

test("desktop speech input explains denied microphone permissions", async () => {
  const provider = createSpeechInputProvider({
    navigator: {
      mediaDevices: {
        getUserMedia: async () => {
          const error = new Error("Permission denied");
          error.name = "NotAllowedError";
          throw error;
        },
      },
    },
    AudioContext: class {},
    codeClashDesktop: { speech: { transcribe: async () => "" } },
  });

  await assert.rejects(
    provider.start({
      language: "en",
      onTranscript: () => {},
      onError: () => {},
    }),
    /Microphone access was denied/,
  );
});

test("speech providers report when a platform capability is unavailable", () => {
  assert.equal(createSpeechInputProvider({}), null);
  assert.equal(createSpeechOutputProvider({}), null);
});

test("speech output provider applies language and selected voice", () => {
  let spoken;
  const voice = { name: "Microsoft Pallavi", lang: "ta-IN" };
  const synthesis = {
    getVoices: () => [voice],
    addEventListener() {},
    removeEventListener() {},
    cancel() {},
    speak: (utterance) => { spoken = utterance; },
  };
  class MockUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  const provider = createSpeechOutputProvider({
    speechSynthesis: synthesis,
    SpeechSynthesisUtterance: MockUtterance,
  });
  provider.speak("வணக்கம்", { language: "ta", profile: "girl" });
  assert.equal(spoken.lang, "ta-IN");
  assert.equal(spoken.voice, voice);
});

test("native voice choices expose only matching boy and girl voices for the selected language", () => {
  const choices = getVoiceProfileChoices([
    { name: "Microsoft David", lang: "en-US" },
    { name: "Microsoft Zira", lang: "en-US" },
    { name: "Microsoft Pallavi", lang: "ta-IN" },
  ], "en");
  assert.equal(choices.boy.name, "Microsoft David");
  assert.equal(choices.girl.name, "Microsoft Zira");
  const tamilChoices = getVoiceProfileChoices([
    { name: "Microsoft Pallavi", lang: "ta-IN" },
  ], "ta");
  assert.equal(tamilChoices.boy, null);
  assert.equal(tamilChoices.girl.name, "Microsoft Pallavi");
});

test("native speech output reports when the selected profile is unavailable", () => {
  const provider = createSpeechOutputProvider({
    speechSynthesis: {
      getVoices: () => [{ name: "Unknown", lang: "en-US" }],
      addEventListener() {},
      removeEventListener() {},
      cancel() {},
      speak() {},
    },
    SpeechSynthesisUtterance: class {},
  });
  assert.throws(() => provider.speak("Hello", { language: "en", profile: "boy" }), /No native boy voice/);
});
