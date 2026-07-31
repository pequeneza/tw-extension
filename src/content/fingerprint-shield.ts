/**
 * xBot — Fingerprint Shield. MAIN world, document_start — runs before any
 * page script (including TribalWars' own), so canvas/WebGL/audio/hardware
 * reads are already spoofed by the time anything on the page looks at them.
 *
 * Gated by localStorage["xbot_fp_enabled_v1"], mirrored by router.ts from the
 * master bot-enabled + license state on the PREVIOUS load — this script runs
 * in the MAIN world and can't reach chrome.storage directly, and document_start
 * always fires before router.ts's own document_end code on the same load, so
 * there's an inherent one-load lag on any toggle change. That's acceptable.
 *
 * Deliberately self-contained (no imports): MAIN-world scripts don't share the
 * isolated-world module graph the rest of the extension uses.
 */
(function () {
  "use strict";

  if ((window as any).__xbotFpShieldRunning) return;
  (window as any).__xbotFpShieldRunning = true;

  const ENABLED_KEY = "xbot_fp_enabled_v1";
  const SEED_KEY = "xbot_fp_seed_v1";

  let enabled = false;
  try {
    enabled = localStorage.getItem(ENABLED_KEY) === "1";
  } catch (_) {
    return; // localStorage blocked (e.g. private mode) — fail open to real values
  }
  if (!enabled) return;

  // ─── Per-profile stable seed ────────────────────────────────────────────
  // Generated once, persisted forever: same browser profile always spoofs to
  // the same values (stable, non-suspicious); a different profile/machine
  // gets its own independent seed (decorrelated).
  function getOrCreateSeed(): number {
    try {
      const raw = localStorage.getItem(SEED_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) return n;
      }
    } catch (_) {}
    let seed: number;
    try {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      seed = buf[0]!;
    } catch (_) {
      seed = Math.floor(Math.random() * 0xffffffff);
    }
    try {
      localStorage.setItem(SEED_KEY, String(seed));
    } catch (_) {}
    return seed;
  }

  // mulberry32 — tiny deterministic PRNG, seeded once per profile.
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const seed = getOrCreateSeed();
  const rand = mulberry32(seed);
  // Distinct sub-streams so unrelated surfaces don't accidentally correlate
  // with each other off the same draw sequence.
  const rand2 = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const rand3 = mulberry32((seed ^ 0x85ebca6b) >>> 0);

  function pick<T>(arr: T[], rng: () => number): T {
    return arr[Math.floor(rng() * arr.length) % arr.length]!;
  }

  // ─── Canvas ──────────────────────────────────────────────────────────────
  // Adds imperceptible, deterministic per-pixel noise before returning image
  // data — same canvas content + same seed always noises identically (stable
  // across reads/reloads), but differs from the true pixels and from other
  // installs. Noise stays low-amplitude so nothing is visually detectable.
  try {
    const noisePixels = (data: Uint8ClampedArray) => {
      // Touch ~1 in 40 pixels, +/-1 on a single channel — invisible, but
      // enough to change the resulting hash/dataURL deterministically.
      for (let i = 0; i < data.length; i += 4) {
        if (rand() > 0.025) continue;
        const channel = i + (Math.floor(rand2() * 3) | 0);
        const delta = rand3() > 0.5 ? 1 : -1;
        data[channel] = Math.max(0, Math.min(255, data[channel]! + delta));
      }
    };

    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args: any[]) {
      const imgData = origGetImageData.apply(this, args as any);
      noisePixels(imgData.data);
      return imgData;
    };

    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args: any[]) {
      const ctx = this.getContext("2d");
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          const imgData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
          noisePixels(imgData.data);
          ctx.putImageData(imgData, 0, 0);
        } catch (_) {
          /* tainted canvas or other read failure — fall through untouched */
        }
      }
      return origToDataURL.apply(this, args as any);
    };

    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      ...rest: any[]
    ) {
      const ctx = this.getContext("2d");
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          const imgData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
          noisePixels(imgData.data);
          ctx.putImageData(imgData, 0, 0);
        } catch (_) {
          /* tainted canvas or other read failure — fall through untouched */
        }
      }
      return origToBlob.call(this, callback, ...(rest as any));
    };
  } catch (_) {
    /* canvas patch failed — leave WebGL/audio/hardware patches unaffected */
  }

  // ─── WebGL vendor/renderer ───────────────────────────────────────────────
  try {
    const RENDERER_POOL: Array<[string, string]> = [
      ["Google Inc. (Intel)", "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
      ["Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
      ["Google Inc. (AMD)", "ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
      ["Google Inc. (Intel)", "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"],
      ["Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
    ];
    const [vendorStr, rendererStr] = pick(RENDERER_POOL, rand);
    const UNMASKED_VENDOR_WEBGL = 0x9245;
    const UNMASKED_RENDERER_WEBGL = 0x9246;

    function patchGetParameter(proto: any) {
      if (!proto) return;
      const orig = proto.getParameter;
      proto.getParameter = function (pname: number) {
        if (pname === UNMASKED_VENDOR_WEBGL) return vendorStr;
        if (pname === UNMASKED_RENDERER_WEBGL) return rendererStr;
        return orig.call(this, pname);
      };
    }
    patchGetParameter((window as any).WebGLRenderingContext?.prototype);
    patchGetParameter((window as any).WebGL2RenderingContext?.prototype);
  } catch (_) {
    /* WebGL patch failed — leave other patches unaffected */
  }

  // ─── AudioContext ────────────────────────────────────────────────────────
  try {
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (...args: any[]) {
      const data = origGetChannelData.apply(this, args as any);
      // Extremely small noise — inaudible, but perturbs the fingerprint hash.
      for (let i = 0; i < data.length; i += 100) {
        data[i] = data[i]! + (rand() - 0.5) * 1e-7;
      }
      return data;
    };

    if ((window as any).AnalyserNode) {
      const origGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
      AnalyserNode.prototype.getFloatFrequencyData = function (...args: any[]) {
        origGetFloatFrequencyData.apply(this, args as any);
        const arr = args[0] as Float32Array;
        for (let i = 0; i < arr.length; i += 10) {
          arr[i] = arr[i]! + (rand2() - 0.5) * 1e-3;
        }
      };
    }
  } catch (_) {
    /* AudioContext patch failed — leave other patches unaffected */
  }

  // ─── Hardware signals ────────────────────────────────────────────────────
  try {
    const CORES_POOL = [4, 8, 12, 16];
    const MEMORY_POOL = [4, 8];
    Object.defineProperty(navigator, "hardwareConcurrency", {
      get: () => pick(CORES_POOL, rand),
      configurable: true,
    });
    if ("deviceMemory" in navigator) {
      Object.defineProperty(navigator, "deviceMemory", {
        get: () => pick(MEMORY_POOL, rand2),
        configurable: true,
      });
    }
  } catch (_) {
    /* hardware-signal patch failed — leave other patches unaffected */
  }

  // ─── navigator.webdriver ─────────────────────────────────────────────────
  // Defensive — this extension automates via a real user-driven browser, not
  // CDP/WebDriver, so this is normally already false. Costs nothing to pin.
  try {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
      configurable: true,
    });
  } catch (_) {
    /* already non-configurable or overridden elsewhere — ignore */
  }

  // ─── Client Hints (navigator.userAgentData) ─────────────────────────────
  // getHighEntropyValues() exposes real OS build/architecture independent of
  // everything spoofed above. Only the high-entropy fields are touched —
  // low-entropy brands/mobile/platform are left alone since they're already
  // generic ("Chrome"/"Not.A;Brand") and changing them risks an inconsistency
  // with the real User-Agent header the network stack still sends.
  try {
    const uaDataProto = (window as any).NavigatorUAData?.prototype;
    if (uaDataProto && typeof uaDataProto.getHighEntropyValues === "function") {
      const PLATFORM_VERSIONS = ["10.0.0", "10.0.19045", "10.0.22621", "10.0.22631"];
      const spoofedHighEntropy: Record<string, unknown> = {
        platformVersion: pick(PLATFORM_VERSIONS, rand),
        architecture: "x86",
        bitness: "64",
        model: "",
      };
      const origGetHighEntropyValues = uaDataProto.getHighEntropyValues;
      uaDataProto.getHighEntropyValues = function (hints: string[]) {
        return origGetHighEntropyValues.call(this, hints).then((real: Record<string, unknown>) => {
          const out = { ...real };
          for (const h of hints) if (h in spoofedHighEntropy) out[h] = spoofedHighEntropy[h];
          return out;
        });
      };
    }
  } catch (_) {
    /* Client Hints patch failed — leave other patches unaffected */
  }

  // ─── Screen color/pixel depth ────────────────────────────────────────────
  // Inert metadata — nothing reads these to size or scale actual rendering,
  // unlike devicePixelRatio (skipped below), so there's no visual-breakage
  // risk in overriding them.
  try {
    const DEPTH_POOL = [24, 30];
    const depth = pick(DEPTH_POOL, rand3);
    Object.defineProperty(screen, "colorDepth", { get: () => depth, configurable: true });
    Object.defineProperty(screen, "pixelDepth", { get: () => depth, configurable: true });
  } catch (_) {
    /* screen-depth patch failed — leave other patches unaffected */
  }

  // ─── Canvas text-metric noise (font-fingerprint mitigation) ─────────────
  // The dominant real-world font-detection technique measures text width
  // across candidate fonts via measureText() and compares against a
  // baseline. Tiny deterministic noise on the returned width blurs that
  // measurement below the precision most detection libraries rely on,
  // without any visible layout effect (actual glyph rendering is untouched —
  // only the JS-read metric value changes).
  try {
    const origMeasureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function (text: string) {
      const result = origMeasureText.call(this, text);
      try {
        const noised = result.width * (1 + (rand2() - 0.5) * 0.001);
        Object.defineProperty(result, "width", { value: noised, configurable: true });
      } catch (_) {
        /* TextMetrics.width not configurable in this engine — leave as-is */
      }
      return result;
    };
  } catch (_) {
    /* measureText patch failed — leave other patches unaffected */
  }

  // ─── Deliberately NOT spoofed in v1 (see plan rationale) ────────────────
  // - Timezone (Intl.DateTimeFormat / getTimezoneOffset): a spoofed timezone
  //   inconsistent with the account's real play-time pattern can be a
  //   stronger signal than leaving it truthful.
  // - Full screen resolution (screen.width/height) and devicePixelRatio:
  //   risk visually breaking TW's viewport-sized UI or blurring canvas
  //   rendering that scales its backing store off devicePixelRatio.
  // - Full document.fonts enumeration: the measureText noise above covers
  //   the dominant canvas-based detection method; a complete font-list
  //   virtualization is higher effort for comparatively little extra value.
  // - TLS/JA3 and HTTP header-ordering fingerprinting: happens below the
  //   extension layer, in Chrome's own network stack — not fixable from
  //   within any Chrome extension, VPN or not.
})();
