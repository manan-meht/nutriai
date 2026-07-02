(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,41574,e=>{"use strict";var t=e.i(43476),r=e.i(71645),i=e.i(71140);let o=`
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`,n=`
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
}`;e.s(["AdultsShaderBackground",0,function({className:e=""}){let a=(0,r.useRef)(null),c=(0,r.useRef)(0),u=(0,i.useReducedMotion)();return(0,r.useEffect)(()=>{let e=a.current;if(!e)return;function t(){let t=e.clientWidth||1280,r=e.clientHeight||720;(e.width!==t||e.height!==r)&&(e.width=t,e.height=r)}let r=new ResizeObserver(t);r.observe(e),t();let i=e.getContext("webgl")||e.getContext("experimental-webgl");if(!i)return;function l(e,t){let r=i.createShader(e);return i.shaderSource(r,t),i.compileShader(r),r}let s=i.createProgram();i.attachShader(s,l(i.VERTEX_SHADER,o)),i.attachShader(s,l(i.FRAGMENT_SHADER,n)),i.linkProgram(s),i.useProgram(s);let f=i.createBuffer();i.bindBuffer(i.ARRAY_BUFFER,f),i.bufferData(i.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),i.STATIC_DRAW);let d=i.getAttribLocation(s,"a_position");i.enableVertexAttribArray(d),i.vertexAttribPointer(d,2,i.FLOAT,!1,0,0);let h=i.getUniformLocation(s,"u_time"),v=i.getUniformLocation(s,"u_resolution");if(u){t(),i.viewport(0,0,e.width,e.height),h&&i.uniform1f(h,0),v&&i.uniform2f(v,e.width,e.height),i.drawArrays(i.TRIANGLE_STRIP,0,4),r.disconnect();return}let m=new IntersectionObserver(([r])=>{r.isIntersecting?c.current=requestAnimationFrame(function r(o){t(),i.viewport(0,0,e.width,e.height),h&&i.uniform1f(h,.001*o),v&&i.uniform2f(v,e.width,e.height),i.drawArrays(i.TRIANGLE_STRIP,0,4),c.current=requestAnimationFrame(r)}):cancelAnimationFrame(c.current)},{threshold:.01});return m.observe(e),()=>{cancelAnimationFrame(c.current),r.disconnect(),m.disconnect()}},[u]),(0,t.jsx)("canvas",{ref:a,"aria-hidden":"true",className:`block w-full h-full ${e}`})}])},53290,e=>{e.n(e.i(41574))}]);