const SPEECH_SAMPLE_RATE = 16000;
const MAX_SPEECH_DURATION_SECONDS = 30;

const LANGUAGE_LOCALES = {
  en: "en-IN",
  ta: "ta-IN",
  hi: "hi-IN",
  ml: "ml-IN",
  te: "te-IN",
  bn: "bn-IN",
  kn: "kn-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  pa: "pa-IN",
};

function languageLocale(language) {
  return LANGUAGE_LOCALES[String(language || "en")] || "en-IN";
}

function languagePrefix(language) {
  return String(language || "en").slice(0, 2).toLowerCase();
}

function resampleAudio(chunks, sourceSampleRate) {
  const inputLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (!inputLength || !Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
    return new Float32Array();
  }
  const input = new Float32Array(inputLength);
  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }

  const outputLength = Math.floor(input.length * SPEECH_SAMPLE_RATE / sourceSampleRate);
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * sourceSampleRate / SPEECH_SAMPLE_RATE;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    output[index] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

function microphoneError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return new Error("Microphone access was denied. Allow microphone access for CodeClash in Windows settings and try again.");
    case "NotFoundError":
    case "DevicesNotFoundError":
      return new Error("No microphone was found. Connect a microphone and try again.");
    case "NotReadableError":
    case "TrackStartError":
      return new Error("The microphone is busy or unavailable. Close other apps using it and try again.");
    default:
      return new Error("Could not start microphone capture. Check the microphone connection and try again.");
  }
}

function createDesktopSpeechInputProvider(browser, speech) {
  const mediaDevices = browser.navigator?.mediaDevices;
  const AudioContext = browser.AudioContext || browser.webkitAudioContext;
  if (
    typeof mediaDevices?.getUserMedia !== "function" ||
    typeof AudioContext !== "function"
  ) {
    return null;
  }

  return {
    async start({ language = "en", onTranscript, onError, onStateChange = () => {} }) {
      let stream;
      let context;
      let source;
      let processor;
      let mute;
      try {
        onStateChange("requesting");
        // Ask for raw mono audio and avoid browser DSP that can suppress quiet consonants.
        stream = await mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: { ideal: SPEECH_SAMPLE_RATE },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        context = new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE });
        await context.resume();
        source = context.createMediaStreamSource(stream);
        processor = context.createScriptProcessor(4096, 1, 1);
        mute = context.createGain();
        mute.gain.value = 0;
        const chunks = [];
        let capturedSamples = 0;
        const maxSamples = Math.floor(context.sampleRate * MAX_SPEECH_DURATION_SECONDS);
        processor.onaudioprocess = (event) => {
          if (capturedSamples >= maxSamples) return;
          const input = event.inputBuffer.getChannelData(0);
          const length = Math.min(input.length, maxSamples - capturedSamples);
          chunks.push(new Float32Array(input.subarray(0, length)));
          capturedSamples += length;
        };
        source.connect(processor);
        processor.connect(mute);
        mute.connect(context.destination);
        onStateChange("recording");

        let stopped = false;
        let timer;
        const stop = async ({ transcribe = true } = {}) => {
          if (stopped) return;
          stopped = true;
          clearTimeout(timer);
          processor.onaudioprocess = null;
          processor.disconnect();
          source.disconnect();
          mute.disconnect();
          stream.getTracks().forEach((track) => track.stop());
          if (context.state !== "closed") await context.close();
          if (!transcribe) {
            onStateChange("idle");
            return;
          }
          onStateChange("transcribing");
          try {
            const samples = resampleAudio(chunks, context.sampleRate);
            if (!samples.length) {
              onError("No speech was recorded. Please try again or type your question.");
              return;
            }
            const transcript = await speech.transcribe({
              samples,
              sampleRate: SPEECH_SAMPLE_RATE,
              language,
            });
            if (typeof transcript === "string" && transcript.trim()) {
              onTranscript(transcript.trim());
            } else {
              onError("No speech was recognized. Please try again or type your question.");
            }
          } catch (error) {
            onError(error.message || "Speech could not be transcribed. Please try again.");
          } finally {
            onStateChange("idle");
          }
        };
        timer = setTimeout(() => { void stop(); }, MAX_SPEECH_DURATION_SECONDS * 1000);
        return stop;
      } catch (error) {
        if (processor) processor.disconnect();
        if (source) source.disconnect();
        if (mute) mute.disconnect();
        stream?.getTracks().forEach((track) => track.stop());
        if (context && context.state !== "closed") await context.close();
        onStateChange("idle");
        throw microphoneError(error);
      }
    },
  };
}

export function createSpeechInputProvider(browser = globalThis) {
  const desktopSpeech = browser.codeClashDesktop?.speech;
  if (desktopSpeech && typeof desktopSpeech.transcribe === "function") {
    return createDesktopSpeechInputProvider(browser, desktopSpeech);
  }

  const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
  if (typeof Recognition !== "function") return null;

  return {
    start({ language, onTranscript, onError }) {
      const recognition = new Recognition();
      recognition.lang = languageLocale(language);
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (typeof transcript === "string" && transcript.trim()) onTranscript(transcript);
        else onError("No speech was recognized. Please try again or type your question.");
      };
      recognition.onerror = (event) => {
        const messages = {
          "not-allowed": "Microphone access was denied. Allow microphone access in device settings and try again.",
          "no-speech": "No speech was recognized. Please try again or type your question.",
          network: "The browser speech service is unavailable. Try the CodeClash desktop app's offline speech input.",
        };
        onError(messages[event.error] || "Speech input was unavailable. Check microphone permission or type your question.");
      };
      recognition.start();
      return () => recognition.stop();
    },
  };
}

export function createSpeechOutputProvider(browser = globalThis) {
  const synthesis = browser.speechSynthesis;
  const Utterance = browser.SpeechSynthesisUtterance;
  if (!synthesis || typeof Utterance !== "function") return null;

  return {
    getVoices() {
      return synthesis.getVoices();
    },
    onVoicesChanged(listener) {
      synthesis.addEventListener("voiceschanged", listener);
      return () => synthesis.removeEventListener("voiceschanged", listener);
    },
    speak(text, { language, profile }) {
      synthesis.cancel();
      const utterance = new Utterance(text);
      utterance.lang = languageLocale(language);
      utterance.voice = getVoiceProfileChoices(synthesis.getVoices(), language)[profile] || null;
      if (!utterance.voice) {
        throw new Error(`No native ${profile} voice is installed for ${utterance.lang}.`);
      }
      synthesis.speak(utterance);
    },
    cancel() {
      synthesis.cancel();
    },
  };
}

const voiceNamePatterns = {
  boy: /\b(alex|andrew|daniel|david|guy|james|mark|rishi|thomas|valluvar)\b/i,
  girl: /\b(aria|heera|jenny|karen|kalpana|moira|pallavi|samantha|sonia|tessa|zira)\b/i,
};

function voiceGender(voice) {
  const declared = String(voice.gender || voice.voiceGender || "").toLowerCase();
  if (declared === "male" || declared.includes(" male")) return "boy";
  if (declared === "female" || declared.includes(" female")) return "girl";
  const identity = `${voice.name || ""} ${voice.voiceURI || ""}`;
  return Object.entries(voiceNamePatterns)
    .find(([, pattern]) => pattern.test(identity))?.[0] || "";
}

export function getVoiceProfileChoices(voices, language) {
  const prefix = languagePrefix(language);
  const matchingVoices = voices.filter((voice) =>
    String(voice.lang || "").toLowerCase().startsWith(prefix),
  );
  return {
    boy: matchingVoices.find((voice) => voiceGender(voice) === "boy") || null,
    girl: matchingVoices.find((voice) => voiceGender(voice) === "girl") || null,
  };
}
