import { env, pipeline } from "@huggingface/transformers";

const MODEL = "onnx-community/depth-anything-v2-small";
// Keep WASM inference off the UI thread without requiring cross-origin isolation.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

type DepthJob = { id: number; imageUrl: string; sceneId?: string; forceWasm?: boolean };
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<DepthJob>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let latest: DepthJob | null = null;
let running = false;
let forceWasm = false;

async function createEstimator() {
  // Presence of navigator.gpu does not mean a usable adapter exists.
  const gpu = (navigator as unknown as {
    gpu?: { requestAdapter: () => Promise<unknown | null> };
  }).gpu;
  let hasAdapter = false;
  if (!forceWasm && gpu) {
    try { hasAdapter = Boolean(await gpu.requestAdapter()); } catch { /* use WASM */ }
  }
  forceWasm = !hasAdapter;
  return pipeline("depth-estimation", MODEL, {
    device: hasAdapter ? "webgpu" : "wasm",
    dtype: "q8",
    session_options: { executionProviders: hasAdapter ? ["webgpu", "wasm"] : ["wasm"] },
  });
}
let estimatorPromise: ReturnType<typeof createEstimator> | null = null;

const DEPTH_CACHE = "train-discovery-depth-v1";

function cacheUrl(job: DepthJob) {
  if (!job.sceneId || !/^[a-f0-9]{64}$/.test(job.sceneId)) return null;
  return new URL("/__time-portal-depth/" + job.sceneId, self.location.href).href;
}

async function cachedDepth(job: DepthJob) {
  const url = cacheUrl(job);
  if (!url || typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(DEPTH_CACHE);
    const response = await cache.match(url);
    if (!response) return null;
    const width = Number(response.headers.get("X-Depth-Width"));
    const height = Number(response.headers.get("X-Depth-Height"));
    const pixels = await response.arrayBuffer();
    if (width <= 0 || height <= 0 || pixels.byteLength !== width * height) return null;
    return { width, height, pixels };
  } catch {
    return null;
  }
}

async function saveDepth(job: DepthJob, width: number, height: number, pixels: ArrayBuffer) {
  const url = cacheUrl(job);
  if (!url || typeof caches === "undefined") return;
  try {
    const cache = await caches.open(DEPTH_CACHE);
    await cache.put(url, new Response(pixels.slice(0), { headers: {
      "Content-Type": "application/octet-stream",
      "X-Depth-Width": String(width),
      "X-Depth-Height": String(height),
    } }));
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - 12))) await cache.delete(key);
  } catch {
    // Private browsing or a full cache must not prevent exploring a scene.
  }
}

async function drain() {
  running = true;
  while (latest) {
    const job = latest;
    latest = null;
    try {
      const cached = await cachedDepth(job);
      if (cached) {
        worker.postMessage({ id: job.id, ...cached }, [cached.pixels]);
        continue;
      }
      estimatorPromise ??= createEstimator();
      const estimator = await estimatorPromise;
      // A newer era may have been selected while weights were downloading.
      if (latest) continue;
      const result = await estimator(job.imageUrl);
      const width = result.depth.width;
      const height = result.depth.height;
      const pixels = new Uint8Array(result.depth.data).buffer;
      await saveDepth(job, width, height, pixels);
      worker.postMessage({ id: job.id, width, height, pixels }, [pixels]);
    } catch (error) {
      estimatorPromise = null;
      if (!forceWasm) {
        // A rejected ONNX initialization/inference chain cannot be reused for
        // another backend. Ask the UI for a fresh worker running WASM only.
        worker.postMessage({ id: job.id, error: "retry_wasm" });
        continue;
      }
      const diagnostic = error instanceof Error
        ? error.message.replace(/https?:\/\/[^\s"')]+/g, "[resource]").slice(0, 240)
        : "Unknown inference failure";
      console.warn("[time-portal-depth]", diagnostic);
      worker.postMessage({ id: job.id, error: "depth_unavailable" });
    }
  }
  running = false;
}

worker.onmessage = (event) => {
  latest = event.data;
  if (event.data.forceWasm) forceWasm = true;
  if (!running) void drain();
};
