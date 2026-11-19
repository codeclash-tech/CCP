export function createSpeechInputProvider(browser = globalThis) {
  const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
  if (typeof Recognition !== "function") return null;

  return {
    start({ language, onTranscript, onError }) {
      const recognition = new Recognition();
      recognition.lang = language === "ta" ? "ta-IN" : "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (typeof transcript === "string" && transcript.trim()) onTranscript(transcript);
        else onError("No speech was recognized. Please try again or type your question.");
      };
      recognition.onerror = () =>
        onError("Speech input was unavailable. Check microphone permission or type your question.");
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
      utterance.lang = language === "ta" ? "ta-IN" : "en-US";
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
  const prefix = language === "ta" ? "ta" : "en";
  const matchingVoices = voices.filter((voice) =>
    String(voice.lang || "").toLowerCase().startsWith(prefix),
  );
  return {
    boy: matchingVoices.find((voice) => voiceGender(voice) === "boy") || null,
    girl: matchingVoices.find((voice) => voiceGender(voice) === "girl") || null,
  };
}
