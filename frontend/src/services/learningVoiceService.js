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
    speak(text, { language, voiceName }) {
      synthesis.cancel();
      const utterance = new Utterance(text);
      utterance.lang = language === "ta" ? "ta-IN" : "en-US";
      utterance.voice =
        synthesis.getVoices().find((voice) => voice.name === voiceName) || null;
      synthesis.speak(utterance);
    },
    cancel() {
      synthesis.cancel();
    },
  };
}
