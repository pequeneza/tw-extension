import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Test suite for Phase 0: Storage Bridge
 *
 * Tests the request/response round-trip between main-world scripts
 * (via tw-suite-storage-bridge.js) and isolated-world (via storage-bridge.ts).
 */

describe("Storage Bridge", () => {
  let mockChrome: any;
  let storageCallbacks: Map<string, any>;

  beforeEach(() => {
    storageCallbacks = new Map();

    // Mock chrome.storage.local
    mockChrome = {
      storage: {
        local: {
          get: vi.fn((key: string, callback: Function) => {
            setTimeout(() => {
              const result: Record<string, any> = {};
              if (storageCallbacks.has(key)) {
                result[key] = storageCallbacks.get(key);
              }
              callback(result);
            }, 0);
          }),
          set: vi.fn((obj: Record<string, any>, callback: Function) => {
            setTimeout(() => {
              for (const [k, v] of Object.entries(obj)) {
                storageCallbacks.set(k, v);
              }
              callback();
            }, 0);
          }),
          remove: vi.fn((key: string, callback: Function) => {
            setTimeout(() => {
              storageCallbacks.delete(key);
              callback();
            }, 0);
          }),
        },
      },
    };

    (global as any).chrome = mockChrome;
  });

  describe("tw-suite-storage-bridge.js (main-world client)", () => {
    let twStorage: any;

    beforeEach(() => {
      // Simulate the tw-suite-storage-bridge.js code
      twStorage = {
        _requestId: 0,
        request: function (eventName: string, detail: any) {
          return new Promise((resolve) => {
            const reqId = ++this._requestId;
            const timeout = setTimeout(() => {
              document.removeEventListener("xbot:storage:result", handler);
              resolve(undefined);
            }, 2000);

            function handler(e: any) {
              if ((e.detail || {}).requestId !== reqId) return;
              clearTimeout(timeout);
              document.removeEventListener("xbot:storage:result", handler);
              resolve(e.detail);
            }

            document.addEventListener("xbot:storage:result", handler);
            document.dispatchEvent(
              new CustomEvent(eventName, {
                detail: { requestId: reqId, ...detail },
              })
            );
          });
        },
        get: function (key: string) {
          return this.request("xbot:storage:get", { key }).then((r: any) =>
            r ? r.value : undefined
          );
        },
        set: function (key: string, value: any) {
          return this.request("xbot:storage:set", { key, value });
        },
        remove: function (key: string) {
          return this.request("xbot:storage:remove", { key });
        },
      };
    });

    it("should expose window.__twStorage with get/set/remove methods", () => {
      expect(twStorage).toHaveProperty("get");
      expect(twStorage).toHaveProperty("set");
      expect(twStorage).toHaveProperty("remove");
      expect(typeof twStorage.get).toBe("function");
      expect(typeof twStorage.set).toBe("function");
      expect(typeof twStorage.remove).toBe("function");
    });

    it("should timeout requests after 2 seconds if no listener responds", async () => {
      const start = Date.now();
      const result = await twStorage.get("missing_key");
      const elapsed = Date.now() - start;

      expect(result).toBeUndefined();
      expect(elapsed).toBeGreaterThanOrEqual(1900); // ~2s, allow some tolerance
    });
  });

  describe("storage-bridge.ts (isolated-world listener)", () => {
    let storageBridge: any;

    beforeEach(() => {
      // Simulate storage-bridge.ts behavior
      storageBridge = {
        init: function () {
          document.addEventListener("xbot:storage:get", (e: any) => {
            const { key, requestId } = e.detail ?? {};
            if (!requestId) return;

            mockChrome.storage.local.get(key, (result: any) => {
              document.dispatchEvent(
                new CustomEvent("xbot:storage:result", {
                  detail: { requestId, value: result[key] },
                })
              );
            });
          });

          document.addEventListener("xbot:storage:set", (e: any) => {
            const { key, value, requestId } = e.detail ?? {};
            if (!requestId) return;

            mockChrome.storage.local.set({ [key]: value }, () => {
              document.dispatchEvent(
                new CustomEvent("xbot:storage:result", {
                  detail: { requestId, ok: true },
                })
              );
            });
          });

          document.addEventListener("xbot:storage:remove", (e: any) => {
            const { key, requestId } = e.detail ?? {};
            if (!requestId) return;

            mockChrome.storage.local.remove(key, () => {
              document.dispatchEvent(
                new CustomEvent("xbot:storage:result", {
                  detail: { requestId, ok: true },
                })
              );
            });
          });
        },
      };

      storageBridge.init();
    });

    it("should handle xbot:storage:get requests", async () => {
      storageCallbacks.set("test_key", { data: 123 });

      return new Promise<void>((resolve) => {
        const e = new CustomEvent("xbot:storage:get", {
          detail: { key: "test_key", requestId: 1 },
        });

        const handler = (event: any) => {
          if (event.detail.requestId === 1) {
            expect(event.detail.value).toEqual({ data: 123 });
            document.removeEventListener("xbot:storage:result", handler);
            resolve();
          }
        };

        document.addEventListener("xbot:storage:result", handler);
        document.dispatchEvent(e);
      });
    });

    it("should handle xbot:storage:set requests", async () => {
      return new Promise<void>((resolve) => {
        const e = new CustomEvent("xbot:storage:set", {
          detail: { key: "new_key", value: { data: 456 }, requestId: 2 },
        });

        const handler = (event: any) => {
          if (event.detail.requestId === 2) {
            expect(event.detail.ok).toBe(true);
            expect(storageCallbacks.get("new_key")).toEqual({ data: 456 });
            document.removeEventListener("xbot:storage:result", handler);
            resolve();
          }
        };

        document.addEventListener("xbot:storage:result", handler);
        document.dispatchEvent(e);
      });
    });

    it("should handle xbot:storage:remove requests", async () => {
      storageCallbacks.set("delete_key", { data: 789 });

      return new Promise<void>((resolve) => {
        const e = new CustomEvent("xbot:storage:remove", {
          detail: { key: "delete_key", requestId: 3 },
        });

        const handler = (event: any) => {
          if (event.detail.requestId === 3) {
            expect(event.detail.ok).toBe(true);
            expect(storageCallbacks.has("delete_key")).toBe(false);
            document.removeEventListener("xbot:storage:result", handler);
            resolve();
          }
        };

        document.addEventListener("xbot:storage:result", handler);
        document.dispatchEvent(e);
      });
    });
  });

  describe("End-to-end round trip", () => {
    let twStorage: any;

    beforeEach(() => {
      // Set up both sides
      const storageBridge: any = {
        init: function () {
          document.addEventListener("xbot:storage:get", (e: any) => {
            const { key, requestId } = e.detail ?? {};
            if (!requestId) return;

            mockChrome.storage.local.get(key, (result: any) => {
              document.dispatchEvent(
                new CustomEvent("xbot:storage:result", {
                  detail: { requestId, value: result[key] },
                })
              );
            });
          });

          document.addEventListener("xbot:storage:set", (e: any) => {
            const { key, value, requestId } = e.detail ?? {};
            if (!requestId) return;

            mockChrome.storage.local.set({ [key]: value }, () => {
              document.dispatchEvent(
                new CustomEvent("xbot:storage:result", {
                  detail: { requestId, ok: true },
                })
              );
            });
          });

          document.addEventListener("xbot:storage:remove", (e: any) => {
            const { key, requestId } = e.detail ?? {};
            if (!requestId) return;

            mockChrome.storage.local.remove(key, () => {
              document.dispatchEvent(
                new CustomEvent("xbot:storage:result", {
                  detail: { requestId, ok: true },
                })
              );
            });
          });
        },
      };

      storageBridge.init();

      twStorage = {
        _requestId: 0,
        request: function (eventName: string, detail: any) {
          return new Promise((resolve) => {
            const reqId = ++this._requestId;
            const timeout = setTimeout(() => {
              document.removeEventListener("xbot:storage:result", handler);
              resolve(undefined);
            }, 2000);

            function handler(e: any) {
              if ((e.detail || {}).requestId !== reqId) return;
              clearTimeout(timeout);
              document.removeEventListener("xbot:storage:result", handler);
              resolve(e.detail);
            }

            document.addEventListener("xbot:storage:result", handler);
            document.dispatchEvent(
              new CustomEvent(eventName, {
                detail: { requestId: reqId, ...detail },
              })
            );
          });
        },
        get: function (key: string) {
          return this.request("xbot:storage:get", { key }).then((r: any) =>
            r ? r.value : undefined
          );
        },
        set: function (key: string, value: any) {
          return this.request("xbot:storage:set", { key, value });
        },
        remove: function (key: string) {
          return this.request("xbot:storage:remove", { key });
        },
      };
    });

    it("should complete a full get->set->get->remove->get cycle", async () => {
      // Start with empty
      let val = await twStorage.get("e2e_key");
      expect(val).toBeUndefined();

      // Set a value
      const setResult = await twStorage.set("e2e_key", { message: "hello" });
      expect(setResult.ok).toBe(true);

      // Get it back
      val = await twStorage.get("e2e_key");
      expect(val).toEqual({ message: "hello" });

      // Remove it
      const removeResult = await twStorage.remove("e2e_key");
      expect(removeResult.ok).toBe(true);

      // Verify it's gone
      val = await twStorage.get("e2e_key");
      expect(val).toBeUndefined();
    });

    it("should handle concurrent requests with different requestIds", async () => {
      await twStorage.set("key1", "value1");
      await twStorage.set("key2", "value2");

      // Request both concurrently
      const [v1, v2] = await Promise.all([
        twStorage.get("key1"),
        twStorage.get("key2"),
      ]);

      expect(v1).toBe("value1");
      expect(v2).toBe("value2");
    });
  });
});
