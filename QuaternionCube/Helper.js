// ।। ॐ नमः शिवाय ।। \\
// @date 12th October, 2026

/**
 * Sets up WebGPU context.
 * Returns a adapter, device & format.
 * 
 * @export
 * @async
 * @function setupWebGPUContext
 * @param {void}
 * @return {GPUAdapter} adapter
 * @return {GPUDevice} device
 * @return {GPUFormat} format
 */
export async function setupWebGPUContext() {
  try {
    if (!navigator.gpu) {
      console.error(`GPU not available.
      Consider using a latest browser or new device.`);
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    const device  = await adapter.requestDevice();
    const format  = navigator.gpu.getPreferredCanvasFormat();
    return { adapter, device, format };
  } catch (error) {
    console.error("Failed to get WebGPU context: ", error);
  }
}

/**
 * Takes WGSL shader as input & returns compiled version
 * 
 * @export
 * @async
 * @function compileShader
 * @param {GPUDevice} device
 * @param {string} shaderCode
 * @return {GPUShaderModule} module
 */
export async function compileShader(device, shaderCode) {
  try {
    const module = device.createShaderModule({ code: shaderCode });
    const info = await module.getCompilationInfo();
    info.messages.forEach((message) => { console.warn(message); });
    return module;
  } catch (error) {
    console.error("Failed to compile shader: ", error);
  }
}

/**
 * Creates a Perspective Projection Matrix.
 * Also known as Model View Projection Matrix.
 * 
 * @export
 * @function createProjectionMatrix
 * @param {number} fov, field of view
 * @param {number} aspect, width/height ratio
 * @param {number} near, point nearest to camera/observer
 * @param {number} far, point closest to camera/observer
 * @return {ArrayBuffer} Float32Array of form mat4x4f
 */
export function createProjectionMatrix(fov, aspect, near, far) {
  const f = 1.0 / Math.tan(fov / 2.0);
  const nf = 1.0 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0,                     0,
    0,          f, 0,                     0,
    0,          0, far * nf,             -1,
    0,          0, near * far * nf,       0
  ]);
}

/**
 * Returns a base unit cube coordinates using xyzw.
 * 
 * @export
 * @function getBaseCube
 * @param {void}
 * @return {Float32Array}
 */
export function getBaseCube() {
  return new Float32Array([
    // Front face (Z = 1.0)
    -1.0, -1.0,  1.0,  1.0,
     1.0, -1.0,  1.0,  1.0,
     1.0,  1.0,  1.0,  1.0,
    -1.0, -1.0,  1.0,  1.0,
     1.0,  1.0,  1.0,  1.0,
    -1.0,  1.0,  1.0,  1.0,

    // Back face (Z = -1.0)
    -1.0, -1.0, -1.0,  1.0,
    -1.0,  1.0, -1.0,  1.0,
     1.0,  1.0, -1.0,  1.0,
    -1.0, -1.0, -1.0,  1.0,
     1.0,  1.0, -1.0,  1.0,
     1.0, -1.0, -1.0,  1.0,

    // Top face (Y = 1.0)
    -1.0,  1.0, -1.0,  1.0,
    -1.0,  1.0,  1.0,  1.0,
     1.0,  1.0,  1.0,  1.0,
    -1.0,  1.0, -1.0,  1.0,
     1.0,  1.0,  1.0,  1.0,
     1.0,  1.0, -1.0,  1.0,

    // Bottom face (Y = -1.0)
    -1.0, -1.0, -1.0,  1.0,
     1.0, -1.0, -1.0,  1.0,
     1.0, -1.0,  1.0,  1.0,
    -1.0, -1.0, -1.0,  1.0,
     1.0, -1.0,  1.0,  1.0,
    -1.0, -1.0,  1.0,  1.0,

    // Right face (X = 1.0)
     1.0, -1.0, -1.0,  1.0,
     1.0,  1.0, -1.0,  1.0,
     1.0,  1.0,  1.0,  1.0,
     1.0, -1.0, -1.0,  1.0,
     1.0,  1.0,  1.0,  1.0,
     1.0, -1.0,  1.0,  1.0,

    // Left face (X = -1.0)
    -1.0, -1.0, -1.0,  1.0,
    -1.0, -1.0,  1.0,  1.0,
    -1.0,  1.0,  1.0,  1.0,
    -1.0, -1.0, -1.0,  1.0,
    -1.0,  1.0,  1.0,  1.0,
    -1.0,  1.0, -1.0,  1.0
  ]);
}

// Quaternion.js
export class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x; this.y = y; this.z = z; this.w = w;
  }

  static fromAxisAngle(axis, angle) {
    const len = Math.hypot(axis.x, axis.y, axis.z);
    if (len === 0) return new Quaternion(0, 0, 0, 1);
  
    const s = Math.sin(angle / 2.0) / len;
    return new Quaternion(axis.x * s, axis.y * s, axis.z * s, Math.cos(angle / 2.0));
  }

  multiply(q) {
    return new Quaternion(
      this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y,
      this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x,
      this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w,
      this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z
    ).normalize();
  }

  normalize() {
    const len = Math.hypot(this.x, this.y, this.z, this.w);
    return len === 0 ? new Quaternion(0,0,0,1) : new Quaternion(this.x/len, this.y/len, this.z/len, this.w/len);
  }

  toMatrix4() {
    const {x, y, z, w} = this;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    return new Float32Array([
      1 - (yy + zz), xy + wz,       xz - wy,       0,
      xy - wz,       1 - (xx + zz), yz + wx,       0,
      xz + wy,       yz - wx,       1 - (xx + yy), 0,
      0,             0,             0,             1
    ]);
  }
}

/**
 * Tracks & logs frame rates in FPS.
 * 
 * @export
 * @function awakeFPSLogger
 * @param {void}
 * @return {void}
 */
export function awakeFPSLogger() {
  let frameCount = 0;
  let lastTime = performance.now();

  const logFPS = (currentTime) => {
    frameCount++;
    const elapsed = currentTime - lastTime;
    if (elapsed >= 1000.0) {
      console.log(`Frame rate: ${Math.round(frameCount * (1000 / elapsed))}fps.`);
      frameCount = 0;
      lastTime = currentTime - (elapsed % 1000.0);
    }
    requestAnimationFrame(logFPS);
  };

  requestAnimationFrame(logFPS);
}

/**
 * Converts a mouse/finger drag delta into a rotation quaternion.
 * Drag direction becomes the rotation axis (perpendicular to screen).
 * Drag magnitude becomes the rotation angle.
 * 
 * @export
 * @function dragToQuaternion
 * @param {number} dx - horizontal drag delta in pixels
 * @param {number} dy - vertical drag delta in pixels
 * @param {number} sensitivity - pixels → radians conversion
 * @returns {Quaternion}
 */
export function dragToQuaternion(dx, dy, sensitivity = 0.005) {
  // The drag vector in screen space
  const dragX = dx * sensitivity;
  const dragY = dy * sensitivity;
  const angle = Math.hypot(dragX, dragY);
  
  if (angle < 1e-6) return new Quaternion(0, 0, 0, 1); // identity
  
  // The rotation axis: perpendicular to the drag, in screen plane.
  //   Dragging right (dx > 0) → rotate around screen Y axis (vertical)
  //   Dragging down  (dy > 0) → rotate around screen X axis (horizontal)
  // 
  // Because we rotate "the object" not "the camera", we negate the drag.
  const axis = {
    x: dragY / angle,
    y: dragX / angle,
    z: 0
  };
  
  const half = angle / 2.0;
  const s = Math.sin(half);
  return new Quaternion(axis.x * s, axis.y * s, axis.z * s, Math.cos(half));
}