
#!/usr/bin/env python3
"""Isolate WSL Mesa shader-draw failures without Chrome or third-party Python packages.

Run GALLIUM_DRIVER=d3d12 python3 scripts/diagnostics/wsl-gpu-draw.py
Use GALLIUM_DRIVER=llvmpipe as the software control. Requires WSLg display access.
"""
import ctypes, faulthandler, os, sys
faulthandler.enable()
mode = sys.argv[1] if len(sys.argv) > 1 else "x11"
os.environ.setdefault("GALLIUM_DRIVER", "d3d12")

egl = ctypes.CDLL("libEGL.so.1")
gl = ctypes.CDLL("libGL.so.1")
EGLDisplay = ctypes.c_void_p
EGLNativeDisplayType = ctypes.c_void_p
EGLint = ctypes.c_int
EGLenum = ctypes.c_uint
egl.eglGetDisplay.argtypes = [EGLNativeDisplayType]
egl.eglGetDisplay.restype = EGLDisplay
egl.eglGetPlatformDisplay.argtypes = [EGLenum, ctypes.c_void_p, ctypes.c_void_p]
egl.eglGetPlatformDisplay.restype = EGLDisplay
egl.eglInitialize.argtypes = [EGLDisplay, ctypes.POINTER(EGLint), ctypes.POINTER(EGLint)]
egl.eglInitialize.restype = ctypes.c_uint
egl.eglBindAPI.argtypes = [EGLenum]
egl.eglBindAPI.restype = ctypes.c_uint
egl.eglChooseConfig.argtypes = [EGLDisplay, ctypes.POINTER(EGLint), ctypes.POINTER(ctypes.c_void_p), EGLint, ctypes.POINTER(EGLint)]
egl.eglChooseConfig.restype = ctypes.c_uint
egl.eglCreatePbufferSurface.argtypes = [EGLDisplay, ctypes.c_void_p, ctypes.POINTER(EGLint)]
egl.eglCreatePbufferSurface.restype = ctypes.c_void_p
egl.eglCreateContext.argtypes = [EGLDisplay, ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(EGLint)]
egl.eglCreateContext.restype = ctypes.c_void_p
egl.eglMakeCurrent.argtypes = [EGLDisplay, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
egl.eglMakeCurrent.restype = ctypes.c_uint
egl.eglGetError.restype = EGLint
gl.glGetString.argtypes = [ctypes.c_uint]
gl.glGetString.restype = ctypes.c_char_p
EGL_PLATFORM_X11 = 0x31D5
EGL_PLATFORM_SURFACELESS = 0x31DD
EGL_DEFAULT = 0
if mode == "default":
    dpy = egl.eglGetDisplay(None)
elif mode == "surfaceless":
    dpy = egl.eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS, None, None)
elif mode == "x11":
    x11 = ctypes.CDLL("libX11.so.6")
    x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x11.XOpenDisplay.restype = ctypes.c_void_p
    xd = x11.XOpenDisplay(os.environ.get("DISPLAY", ":0").encode())
    if not xd:
        raise SystemExit("Cannot open X display; run with WSLg display access")
    print("xdisplay", hex(xd), flush=True)
    dpy = egl.eglGetPlatformDisplay(EGL_PLATFORM_X11, ctypes.c_void_p(xd), None)
else:
    raise SystemExit("bad mode")
print("display", dpy, "err", hex(egl.eglGetError()), flush=True)
major = EGLint(); minor = EGLint()
ok = egl.eglInitialize(dpy, ctypes.byref(major), ctypes.byref(minor))
print("init", ok, major.value, minor.value, "err", hex(egl.eglGetError()), flush=True)
if not ok:
    sys.exit(1)
EGL_OPENGL_API = 0x30A2
print("bind", egl.eglBindAPI(EGL_OPENGL_API), flush=True)
EGL_SURFACE_TYPE=0x3033; EGL_PBUFFER_BIT=0x0001; EGL_RENDERABLE_TYPE=0x3040
EGL_OPENGL_BIT=0x0008; EGL_NONE=0x3038; EGL_WIDTH=0x3057; EGL_HEIGHT=0x3056
attrs = (EGLint * 5)(EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_RENDERABLE_TYPE, EGL_OPENGL_BIT, EGL_NONE)
cfg = ctypes.c_void_p(); n = EGLint()
ch = egl.eglChooseConfig(dpy, attrs, ctypes.byref(cfg), 1, ctypes.byref(n))
print("choose", ch, "n", n.value, "err", hex(egl.eglGetError()), flush=True)
if not n.value:
    sys.exit(1)
pbat = (EGLint * 5)(EGL_WIDTH, 16, EGL_HEIGHT, 16, EGL_NONE)
surf = egl.eglCreatePbufferSurface(dpy, cfg, pbat)
ctx = egl.eglCreateContext(dpy, cfg, None, (EGLint * 1)(EGL_NONE))
print("surf", surf, "ctx", ctx, "err", hex(egl.eglGetError()), flush=True)
mc = egl.eglMakeCurrent(dpy, surf, surf, ctx)
print("current", mc, "err", hex(egl.eglGetError()), flush=True)
if not mc:
    raise SystemExit("eglMakeCurrent failed")
if mc:
    print("renderer", gl.glGetString(0x1F01), flush=True)
    print("vendor", gl.glGetString(0x1F00), flush=True)
if mc:
    gl.glClearColor.argtypes = [ctypes.c_float]*4
    gl.glClearColor(1,0,0,1)
    gl.glClear(0x4000)
    gl.glFinish()
    print('clear finished', flush=True)
    gl.glCreateShader.restype = ctypes.c_uint
    gl.glShaderSource.argtypes = [ctypes.c_uint, ctypes.c_int, ctypes.POINTER(ctypes.c_char_p), ctypes.c_void_p]
    gl.glCreateProgram.restype = ctypes.c_uint
    program = gl.glCreateProgram()
    for kind, source in [(0x8B31, b'#version 330\nvoid main(){gl_Position=vec4(0,0,0,1);}'), (0x8B30,b'#version 330\nout vec4 color; void main(){color=vec4(1,0,0,1);}')]:
        shader=gl.glCreateShader(kind)
        src=ctypes.c_char_p(source)
        gl.glShaderSource(shader,1,ctypes.byref(src),None)
        gl.glCompileShader(shader)
        status = ctypes.c_int()
        gl.glGetShaderiv(shader, 0x8B81, ctypes.byref(status))
        if not status.value:
            raise SystemExit("Shader compilation failed")
        gl.glAttachShader(program,shader)
    gl.glLinkProgram(program)
    status = ctypes.c_int()
    gl.glGetProgramiv(program, 0x8B82, ctypes.byref(status))
    if not status.value:
        raise SystemExit("Program linking failed")
    print('shader linked',flush=True)
    gl.glUseProgram(program)
    vao=ctypes.c_uint();gl.glGenVertexArrays(1,ctypes.byref(vao));gl.glBindVertexArray(vao)
    gl.glDrawArrays(0,0,1)
    gl.glFinish()
    error = gl.glGetError()
    if error:
        raise SystemExit(f"GL error after draw: {error:#x}")
    print('draw finished (GL_NO_ERROR)',flush=True)
