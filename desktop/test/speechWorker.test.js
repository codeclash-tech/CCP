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

test("speech worker selects multilingual models on low and high-memory systems", () => {
  assert.equal(selectSpeechModel(SPEECH_MODEL_RAM_THRESHOLD_BYTES - 1), "small");
  assert.equal(selectSpeechModel(SPEECH_MODEL_RAM_THRESHOLD_BYTES), "large-v3");
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
      assert.equal(options.env.CODECLASH_SPEECH_MODEL, "large-v3");
      child = createWorkerProcess((request, process) => {
        requestAudio = Buffer.from(request.audioBase64, "base64");
        process.stdout.write(JSON.stringify({ id: request.id, text: "  my transcript  " }) + "\n");
      });
      queueMicrotask(() => child.stdout.write('{"type":"ready"}\n'));
      return child;
    },
  });

  await Promise.all([worker.start(), worker.start()]);
  const samples = new Float32Array([0.25, -0.5, 0.75]);
  const transcript = await worker.transcribe({
    samples,
    sampleRate: 16000,
    language: "en",
  });

  assert.equal(spawnCount, 1);
  assert.equal(transcript, "my transcript");
  assert.deepEqual(
    [...new Float32Array(requestAudio.buffer, requestAudio.byteOffset, 3)],
    [...samples],
  );
  await worker.stop();
});

test("speech worker validates audio formats and accepts multilingual language hints", async () => {
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
});
