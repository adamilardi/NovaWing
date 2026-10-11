# Linux Chrome cannot use the WSL GPU

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

Mesa's own GL context on that stack works. Linux Chrome's GPU process does
not survive using it.

## What the bots do

`launchBrowser()` in `scripts/rl/chrome.mjs` starts headless Windows Chrome
on this host and attaches Playwright over the DevTools port. Windows Chrome
binds that port to 127.0.0.1, which WSL cannot dial, so a small relay on the
Windows vNIC (the nameserver in `/etc/resolv.conf`) forwards it. The WSL-side
child processes must stay referenced. Unref drops them before DevTools is up.

`NOVAWING_SWIFTSHADER=1` keeps Linux Chromium. `scripts/play-bot.mjs` and
`scripts/test-mobile.mjs` still launch that browser. play-bot records video
through Playwright, which the Windows DevTools connection does not.

SwiftShader remains the fallback when Windows Chrome or the relay is absent.
