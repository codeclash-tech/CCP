import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpeechInputProvider,
  createSpeechOutputProvider,
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
  const voice = { name: "Tamil voice" };
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
  provider.speak("வணக்கம்", { language: "ta", voiceName: voice.name });
  assert.equal(spoken.lang, "ta-IN");
  assert.equal(spoken.voice, voice);
});
