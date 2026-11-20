import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import {
  PersistentSpeechWorker,
  SPEECH_MODEL_RAM_THRESHOLD_BYTES,
  selectSpeechModel,
} from "../src/main/speechWorker.js";

function createWorkerProcess(onRequest) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      onRequest(JSON.parse(chunk.toString()), child);
      callback();
    },
    final(callback) {
      child.emit("exit", 0);
      callback();
    },
  });
  child.kill = () => {
    child.emit("exit", 1);
    return true;
  };
  return child;
}

test("speech worker selects English models suitable for available memory", () => {
  assert.equal(selectSpeechModel(SPEECH_MODEL_RAM_THRESHOLD_BYTES - 1), "tiny.en");
  assert.equal(selectSpeechModel(SPEECH_MODEL_RAM_THRESHOLD_BYTES), "base.en");
  assert.equal(selectSpeechModel(8 * 1024 ** 3), "base.en");
  assert.equal(selectSpeechModel(8 * 1024 ** 3, "small.en"), "small.en");
  assert.throws(() => selectSpeechModel(8 * 1024 ** 3, "large-v3"), /must be tiny\.en, base\.en, or small\.en/);
});

test("speech worker starts once and transfers 16 kHz PCM in memory", async () => {
  let spawnCount = 0;
  let requestAudio;
  let child;
  const worker = new PersistentSpeechWorker({
    isPackaged: false,
    resourcesPath: "resources",
    userDataPath: "user-data",
    totalMemoryBytes: SPEECH_MODEL_RAM_THRESHOLD_BYTES,
    pythonExecutable: "python",
    spawnImpl: (executable, args, options) => {
      spawnCount += 1;
      assert.equal(executable, "python");
      assert.match(args[0], /speech_worker\.py$/);
      assert.equal(options.env.CODECLASH_SPEECH_MODEL, "base.en");
      child = createWorkerProcess((request, process) => {
        requestAudio = Buffer.from(request.audioBase64, "base64");
        process.stdout.write(JSON.stringify({ id: request.id, text: "  my transcript  " }) + "\n");
      });
      queueMicrotask(() => child.stdout.write('{"type":"ready"}\n'));
      return child;
    },
  });

  await Promise.all([worker.start(), worker.start()]);
  const samples = new Float32Array(16000 * 31).fill(0.25);
  samples[1] = -0.5;
  samples[samples.length - 1] = 0.75;
  const transcript = await worker.transcribe({
    samples,
    sampleRate: 16000,
    language: "en",
  });

  assert.equal(spawnCount, 1);
  assert.equal(transcript, "my transcript");
  const receivedSamples = new Float32Array(
    requestAudio.buffer,
    requestAudio.byteOffset,
    samples.length,
  );
  assert.equal(receivedSamples.length, samples.length);
  assert.equal(receivedSamples[0], samples[0]);
  assert.equal(receivedSamples[1], samples[1]);
  assert.equal(receivedSamples.at(-1), samples.at(-1));
  await worker.stop();
});

test("speech worker validates audio format without truncating long recordings", async () => {
  const worker = new PersistentSpeechWorker({
    isPackaged: false,
    resourcesPath: "resources",
    userDataPath: "user-data",
    spawnImpl: () => assert.fail("Invalid requests must not start Python"),
  });

  await assert.rejects(
    worker.transcribe({ samples: new Float32Array(10), sampleRate: 8000, language: "en" }),
    /16 kHz/,
  );
  const samples = new Float32Array(16000 * 31);
  assert.equal(
    samples.length,
    16000 * 31,
    "valid recordings longer than the old 30-second limit are retained",
  );
});
