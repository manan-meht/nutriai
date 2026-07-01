"use client";

/**
 * Family/Adults WebGL background shader — extracted from Stitch ANIMATION_18.
 * Palette: surface-container-low #F8F2FB → white.
 * Soft wave animation — used on the Older Adults immersive landing hero.
 */

import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion";

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_texCoord;
uniform float u_time;
uniform vec2 u_resolution;
void main() {
  vec2 uv = v_texCoord;
  float dist = distance(uv, vec2(0.5));
  float wave = sin(dist * 5.0 - u_time * 0.5) * 0.05;
  vec3 color1 = vec3(0.973, 0.949, 0.98);
  vec3 color2 = vec3(1.0, 1.0, 1.0);
  vec3 finalColor = mix(color1, color2, uv.y + wave);
  gl_FragColor = vec4(finalColor, 1.0);
}`;

interface AdultsShaderBackgroundProps {
  className?: string;
}

export function AdultsShaderBackground({ className = "" }: AdultsShaderBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function syncSize() {
      const w = canvas!.clientWidth || 1280;
      const h = canvas!.clientHeight || 720;
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
      }
    }

    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    syncSize();

    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;

    function compileShader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const pos = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_resolution");

    if (reduced) {
      syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, 0);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ro.disconnect();
      return;
    }

    const ioObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) startLoop();
        else cancelAnimationFrame(rafRef.current);
      },
      { threshold: 0.01 }
    );
    ioObserver.observe(canvas);

    function startLoop() {
      function render(t: number) {
        syncSize();
        gl!.viewport(0, 0, canvas!.width, canvas!.height);
        if (uTime) gl!.uniform1f(uTime, t * 0.001);
        if (uRes) gl!.uniform2f(uRes, canvas!.width, canvas!.height);
        gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
        rafRef.current = requestAnimationFrame(render);
      }
      rafRef.current = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      ioObserver.disconnect();
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`block w-full h-full ${className}`}
    />
  );
}
