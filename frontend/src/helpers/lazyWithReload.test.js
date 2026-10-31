import { loadWithReload } from "./lazyWithReload";

const chunkError = Object.assign(new Error("x"), { name: "ChunkLoadError" });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const originalLocation = window.location;
let reload;

beforeEach(() => {
  reload = jest.fn();
  delete window.location;
  window.location = { reload };
  sessionStorage.clear();
});

afterEach(() => {
  window.location = originalLocation;
});

it("resolves the module normally", async () => {
  const mod = { default: () => null };
  await expect(loadWithReload(() => Promise.resolve(mod))).resolves.toBe(mod);
});

it("reloads once on a chunk load error", async () => {
  loadWithReload(() => Promise.reject(chunkError));
  await flush();
  expect(reload).toHaveBeenCalledTimes(1);
});

it("recognizes a chunk error by its message", async () => {
  loadWithReload(() => Promise.reject(new Error("Loading chunk 7 failed.")));
  await flush();
  expect(reload).toHaveBeenCalledTimes(1);
});

it("keeps the promise pending after reloading", async () => {
  const settled = jest.fn();
  loadWithReload(() => Promise.reject(chunkError)).then(settled, settled);
  await flush();
  expect(settled).not.toHaveBeenCalled();
});

it("rethrows when already reloaded recently", async () => {
  sessionStorage.setItem("chunk-reload-at", String(Date.now()));
  await expect(loadWithReload(() => Promise.reject(chunkError))).rejects.toBe(
    chunkError
  );
  expect(reload).not.toHaveBeenCalled();
});

it("reloads again once the recent window has passed", async () => {
  sessionStorage.setItem("chunk-reload-at", String(Date.now() - 31000));
  loadWithReload(() => Promise.reject(chunkError));
  await flush();
  expect(reload).toHaveBeenCalledTimes(1);
});

it("rethrows unrelated errors without reloading", async () => {
  await expect(
    loadWithReload(() => Promise.reject(new Error("boom")))
  ).rejects.toThrow("boom");
  expect(reload).not.toHaveBeenCalled();
});

it("still reloads when sessionStorage is unavailable", async () => {
  const getItem = jest
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation(() => {
      throw new Error("denied");
    });
  const setItem = jest
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("denied");
    });
  loadWithReload(() => Promise.reject(chunkError));
  await flush();
  expect(reload).toHaveBeenCalledTimes(1);
  getItem.mockRestore();
  setItem.mockRestore();
});
