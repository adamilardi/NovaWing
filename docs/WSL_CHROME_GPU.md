# WSL's Mesa/D3D12 shader draw crashes, including in Linux Chrome

Measured on this machine in October 2026. The bot's multi-second steps were
software WebGL frames, not the JEV model.

## What is slow

Playwright steps the game with `page.clock.runFor`. Each stepped frame draws.
On Linux Chromium that draw is SwiftShader:

- One 16ms frame: about 165–191ms of wall time.
- `runFor(320)` (20 frames, a normal JEV hold): about 3.6–4.3s.
- With `game.renderer.render` replaced by a no-op: about 10ms per frame, and
  about 170ms for 20 frames.

A healthy JEV call on a full scene is about 150ms. Prompt size does not move
that. The gap between decisions is the software frames inside `runFor`.

The interactive game is fast because it runs in Windows Chrome, which gets
the AMD Radeon Pro 460. Headless Windows Chrome with `--use-angle=d3d11`
reports `ANGLE (AMD, AMD Radeon Pro 460 Direct3D11)`. The same `runFor(320)`
there is about 312–373ms.

## Why Linux Chrome misses the GPU

The host is WSL2. There is no `/dev/dri`. The GPU is `/dev/dxg` only.
WSLg sets both `DISPLAY=:0` and `WAYLAND_DISPLAY`. Mesa 25.2.8 can use the
Radeon: with `GALLIUM_DRIVER=d3d12`, an EGL pbuffer reports
`D3D12 (AMD Radeon Pro 460)`.

Linux Chrome does not. Playwright Chromium is Chrome for Testing 153
(148 and 145 were tried too). Its ANGLE factory accepts
`--use-gl=angle --use-angle=gl-egl`. `--use-gl=egl` is rejected. Default
WebGL is SwiftShader. `--use-angle=vulkan` with Mesa Dozen dies in
`vkCreateDevice` (exit 139), the same Dozen-on-WSLg crash reported elsewhere.

The gl-egl path loads Mesa, prints `libEGL warning: DRI3 error: Could not
get DRI3 device`, then the GPU process exits 139 inside
`/usr/lib/wsl/lib/libd3d12core.so`. Headless and headed. Chrome 145, 148,
and 153. Unsetting `WAYLAND_DISPLAY` does not avoid it. That unset is the
working workaround in Chromium issue 567222741, which was verified on an
NVIDIA machine where Chrome 145 already succeeded and Chrome 154 only failed
the Wayland-vs-X11 choice. Here the crash is later, in WSL's D3D12 library,
and it happens on Chrome 145 as well. No WebGL renderer string is produced.

## The library is the one current WSL ships

```
WSL version: 3.0.1.0
Kernel version: 6.18.40.1-1
WSLg version: 1.0.79 (built 2026-06-25)
Direct3D version: 1.611.1-81528511
Windows version: 10.0.19045.7725
```

`/usr/lib/wsl/lib/libd3d12core.so` is dated 2023-10-20 and is byte-identical
to `C:\Program Files\WSL\lib\libd3d12core.so`. `libdxcore.so` is dated
2024-03-31. The AMD user-mode driver beside them, `amdxc64.so`, is
31.0.12027.9001 from 2023-03-30. Another `wsl --update` does not replace
these files. They are what this WSL package and the installed AMD driver
contain.

Mesa can create a GL context on that stack, but this does **not** establish
that shader drawing works. The independent draw test below crashes without
Chrome involved.

## Follow-up: reproduced outside Chrome (2026-10-11)

`scripts/diagnostics/wsl-gpu-draw.py` creates an EGL pbuffer, clears it,
compiles and links a minimal vertex/fragment program, and draws one point.
It uses Python's standard-library `ctypes` and the installed EGL/GL libraries.
Run it outside any sandbox that hides `/dev/dxg` or the WSLg display:

```sh
GALLIUM_DRIVER=llvmpipe python3 scripts/diagnostics/wsl-gpu-draw.py
GALLIUM_DRIVER=d3d12 python3 scripts/diagnostics/wsl-gpu-draw.py
```

Measured results with the same script:

- llvmpipe: clear, shader compilation/link, and draw succeed; GL_NO_ERROR,
  exit 0.
- D3D12 (AMD Radeon Pro 460): context creation, clear, and shader
  compilation/link succeed; `glDrawArrays` segfaults, exit 139.

This places a reproducible failure below Chrome, in the Mesa/D3D12/AMD
rendering path. It does not yet identify which component needs a fix.
Changing Chrome flags alone has not repaired it. Additional headless
Chrome probes with `WAYLAND_DISPLAY` unset failed with the default GPU
process, `--in-process-gpu`, disabled stack-guard changes, disabled shader
disk caches, and process-local preloads of libgcc, libstdc++, or
libd3d12core. None produced a valid GPU renderer and red-pixel readback.

The saved Chrome trace's return address at libd3d12core offset `0x2e596d`
is in its bundled libunwind code, immediately after an indirect call;
the attempted target was on the non-executable stack. That is distinct
from the unloaded TLS-destructor signature reported in
[WSLg issue 1497](https://github.com/microsoft/wslg/issues/1497).
The exact cause of the invalid call remains unconfirmed.

No system libraries or drivers were replaced during these probes. The
Windows Chrome path remains the working workaround. A Mesa or Windows
AMD-driver change needs to pass this draw reproducer and then the actual
Chrome/game benchmark before it can be called a fix.

## What the bots do

Normal playtests now use the Windows GPU automatically on this host, including
`npm run bot` and `scripts/test-mobile.mjs`. The launcher prints the WebGL
renderer and rejects software rendering from Windows Chrome. If the Windows
launcher is available but fails, the run stops with an error instead of
silently becoming a slow Linux run.

`npm run bot` defaults to no video. Explicit `RECORD_VIDEO=1` retains
Playwright's Linux video-recording path and prints a software-rendering warning.
Use `RECORD_VIDEO=0` for fast runs, including when overriding video-enabled
npm scripts. Screenshots still work on the Windows GPU path.

To measure actual rendered level-4 frames with a running local server:

```sh
NOVAWING_URL=http://127.0.0.1:4000/ node scripts/diagnostics/benchmark-browser.mjs
```

The benchmark reports the game's renderer, three wall-time measurements for
`page.clock.runFor(320)`, and page errors. Set `NOVAWING_SWIFTSHADER=1` to run
the same measurement on the software backend.

After the launcher changes, the isolated Windows GPU run measured 83, 85,
and 84 ms; the software comparison measured 2522, 2375, and 2216 ms for the
same 320 ms steps (about 28x faster by median). Both reported zero page
errors. These are short level-4 samples, not a whole-campaign benchmark.
Logs are preserved in `.verify-runs/gpu-playtests-2026-10-11/`.

`launchBrowser()` in `scripts/rl/chrome.mjs` starts headless Windows Chrome
on this host and attaches Playwright over the DevTools port. Windows Chrome
binds that port to 127.0.0.1, which WSL cannot dial, so a small relay on the
Windows vNIC (the nameserver in `/etc/resolv.conf`) forwards it. The WSL-side
child processes must stay referenced. Unref drops them before DevTools is up.

`NOVAWING_SWIFTSHADER=1` explicitly selects Linux Chromium. Linux is also used
on machines without the Windows Chrome installation. A failed Windows launch
or unavailable hardware WebGL no longer silently falls back to SwiftShader.
