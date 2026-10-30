import type { OceanWorkerRequest, OceanWorkerResult } from "./oceanWorker";

export function prepareOcean(request: OceanWorkerRequest, signal: AbortSignal): Promise<OceanWorkerResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Ocean initialization stopped", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./oceanWorker.ts", import.meta.url), { type: "module" });
    const stop = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      reject(new DOMException("Ocean initialization stopped", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<OceanWorkerResult>) => {
      stop();
      resolve(data);
    };
    worker.onerror = () => {
      stop();
      reject(new Error("Ocean data preparation failed"));
    };
    worker.postMessage(request);
  });
}
