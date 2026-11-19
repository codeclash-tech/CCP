import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpeechInputProvider,
  createSpeechOutputProvider,
  getVoiceProfileChoices,
} from "../src/services/learningVoiceService.js";

test("speech input provider selects the requested language and returns recognized text", () => {
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
  provider.start({
    language: "ta",
    onTranscript: (value) => { transcript = value; },
    onError: () => assert.fail("Unexpected recognition error"),
  });
  assert.equal(recognition.lang, "ta-IN");
  recognition.onresult({ results: [[{ transcript: "வணக்கம்" }]] });
  assert.equal(transcript, "வணக்கம்");
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
