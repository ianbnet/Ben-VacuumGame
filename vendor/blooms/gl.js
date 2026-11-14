// Small WebGL2 helpers: a context with float layers, programs, and
// full-screen passes. Themes build everything else from these.

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`;

// Returns null when the device cannot hold paint in float layers.
export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;
  const full = gl.getExtension('EXT_color_buffer_float');
  const half = gl.getExtension('EXT_color_buffer_half_float');
  const linear = gl.getExtension('OES_texture_float_linear');
  if (!full && !half) return null;
  const lo = { internal: gl.RGBA16F, name: 'float16' };
  const hi = full && linear ? { internal: gl.RGBA32F, name: 'float32' } : lo;
  gl.bindVertexArray(gl.createVertexArray());
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  return { gl, formats: { hi, lo, rgba8: { internal: gl.RGBA8, name: 'rgba8' } } };
}

function compile(gl, type, source, label) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const numbered = source.split('\n').map((l, i) => `${String(i + 1).padStart(3)} ${l}`).join('\n');
    throw new Error(`Shader "${label}" failed to compile:\n${log}\n${numbered}`);
  }
  return s;
}

export function createProgram(gl, frag, label) {
  const handle = gl.createProgram();
  gl.attachShader(handle, compile(gl, gl.VERTEX_SHADER, VERT, label));
  gl.attachShader(handle, compile(gl, gl.FRAGMENT_SHADER, FRAG_HEAD + frag, label));
  gl.linkProgram(handle);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
    throw new Error(`Program "${label}" failed to link: ${gl.getProgramInfoLog(handle)}`);
  }
  const uniforms = new Map();
  const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(handle, i);
    uniforms.set(info.name.replace(/\[0\]$/, ''), {
      loc: gl.getUniformLocation(handle, info.name),
      type: info.type,
    });
  }
  return { handle, uniforms, label };
}

export function createTexture(gl, format, width, height, filter = gl.LINEAR) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, format.internal, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// A layer you can draw into: one or more textures of the same size.
export function createTarget(gl, format, width, height, count = 1) {
  const textures = [];
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const buffers = [];
  for (let i = 0; i < count; i++) {
    const tex = createTexture(gl, format, width, height);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
    textures.push(tex);
    buffers.push(gl.COLOR_ATTACHMENT0 + i);
  }
  gl.drawBuffers(buffers);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Layer ${format.name} ${width}x${height} is not drawable (status ${status})`);
  }
  const target = { fbo, textures, tex: textures[0], width, height };
  clearTarget(gl, target);
  return target;
}

export function clearTarget(gl, target) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, target.width, target.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function disposeTarget(gl, target) {
  for (const t of target.textures) gl.deleteTexture(t);
  gl.deleteFramebuffer(target.fbo);
}

// Two layers that take turns being read and written.
export function createDouble(gl, format, width, height, count = 1) {
  let a = createTarget(gl, format, width, height, count);
  let b = createTarget(gl, format, width, height, count);
  return {
    get read() { return a; },
    get write() { return b; },
    swap() { [a, b] = [b, a]; },
    clear() { clearTarget(gl, a); clearTarget(gl, b); },
    dispose() { disposeTarget(gl, a); disposeTarget(gl, b); },
  };
}

// Draw one full-screen pass. `target` null means the screen.
export function runPass(gl, program, target, values) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  gl.viewport(0, 0,
    target ? target.width : gl.drawingBufferWidth,
    target ? target.height : gl.drawingBufferHeight);
  gl.useProgram(program.handle);
  let unit = 0;
  for (const name in values) {
    const u = program.uniforms.get(name);
    if (!u) continue; // unused by this shader
    const v = values[name];
    switch (u.type) {
      case gl.FLOAT: if (typeof v === 'number') gl.uniform1f(u.loc, v); else gl.uniform1fv(u.loc, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
      case gl.INT: case gl.BOOL: gl.uniform1i(u.loc, v); break;
      case gl.INT_VEC2: gl.uniform2iv(u.loc, v); break;
      case gl.SAMPLER_2D:
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v);
        gl.uniform1i(u.loc, unit);
        unit++;
        break;
      default: throw new Error(`${program.label}: uniform ${name} has a type runPass does not set`);
    }
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
