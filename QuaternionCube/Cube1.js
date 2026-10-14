// ।। ॐ नमः शिवाय ।। \\
// @date_start 12th October, 2026

import { vw, vh } from "./Constants.js";
import { setupWebGPUContext, compileShader } from "./Helper.js";
import { createProjectionMatrix, getBaseCube } from "./Helper.js";
import { Quaternion, dragToQuaternion } from "./Helper.js";
import { awakeFPSLogger } from "./Helper.js";

///// --- SETUP --- \\\\\

const canvas = document.getElementById("canvas");
const brush = canvas.getContext('webgpu');

/**
 * Sets up canvas rendering context by writing resolution & configuring brush.
 * 
 * @function setupCanvasContext
 * @param {HTMLCanvasElement} canvas
 * @param {brush} GPUCanvasContext
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @return {void}
 */
function setupCanvasContext(canvas, brush, device, format) {
  canvas.width  = vw;
  canvas.height = vh;
  brush.configure({
    device: device,
    format: format
  });
}

const wgpu = {
  shader: null,
  module: null,
  pipeline: null,
  textures: {},
  buffers: {},
  bindGroup: null,
  encoder: null,
  pass: null
};

wgpu.shader = `
  @group(0) @binding(0) var<uniform> proj_matrix: mat4x4f;
  @group(0) @binding(1) var<uniform> base_cube:   array<vec4f, 36>;
  @group(0) @binding(2) var<uniform> quaternion:  mat4x4f;

  struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) colour: vec4f,
  };
  
  @vertex
  fn vs_main(@builtin(vertex_index) i: u32) -> VertexOutput {
    var output: VertexOutput;
    output.pos = quaternion * base_cube[i];
    output.pos.z -= 10.0;
    output.pos = proj_matrix * output.pos;
    output.colour = 0.5 * (base_cube[i] + vec4f(1.0, 1.0, 1.0, 1.0));
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4f {
    return input.colour;
  }
`;

/**
 * Sets up render pipeline.
 * 
 * @async
 * @function awakeRenderPipeline
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @return {void}
 */
async function awakeRenderPipeline(device, format) {
  try {
    wgpu.pipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: {
        module: wgpu.module,
        entryPoint: "vs_main"
      },
      fragment: {
        module: wgpu.module,
        entryPoint: "fs_main",
        targets: [{ format: format }]
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus'
      },
      multisample: { count: 4 },
      primitive: {
        topology: 'triangle-list',
        // frontFace: 'cw',
        cullMode: 'back'
      }
    });
  } catch (error) {
    console.error("Failed to setup render pipeline: ", error);
  }
}

/**
 * Sets up textures.
 * - depth stencil
 * - msaa 
 * 
 * @function awakeTextures
 * @param {HTMLCanvasElement} canvas
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @return {void}
 */
function awakeTextures(canvas, device, format) {
  try {
    wgpu.textures.depth = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      sampleCount: 4,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    wgpu.textures.msaa = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      sampleCount: 4,
      format: format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
    
    /**
     * @learning @important
     * 
     * When using MSAA with 3D,
     * ensure depthStencil texture object too has `sampleCount`
     * with same number as msaa texture.
     */
  } catch (error) {
    console.error("Crash at textures setup stage: ", error);
  }
}

/**
 * Sets up buffers.
 * 
 * @function awakeBuffers
 * @param {GPUDevice} device
 * @return {void}
 */
function awakeBuffers(device) {
  try {
    // << projection matrix buffer >> \\
    const aspect = Math.min(vw, vh) / Math.max(vw, vh);
    const projMatrix = createProjectionMatrix(Math.PI / 3.0, aspect, 1.0, 100.0);
    wgpu.buffers.projMatrix = device.createBuffer({
      size: projMatrix.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(wgpu.buffers.projMatrix.getMappedRange()).set(projMatrix);
    wgpu.buffers.projMatrix.unmap();

    // << base cube buffer >> \\
    const baseCube = getBaseCube();
    wgpu.buffers.baseCube = device.createBuffer({
      size: baseCube.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(wgpu.buffers.baseCube.getMappedRange()).set(baseCube);
    wgpu.buffers.baseCube.unmap();

    // << quaternion buffer >> \\
    wgpu.buffers.quaternion = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  } catch (error) {
    console.error("Failed at buffer setup stage: ", error);
  }
}

/**
 * Sets up bind group.
 * 
 * @function awakeBindGroup
 * @param {GPUDevice} device
 * @return {void}
 */
function awakeBindGroup(device) {
  try {
    wgpu.bindGroup = device.createBindGroup({
      layout: wgpu.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: wgpu.buffers.projMatrix } },
        { binding: 1, resource: { buffer: wgpu.buffers.baseCube   } },
        { binding: 2, resource: { buffer: wgpu.buffers.quaternion } }
      ]
    });
  } catch (error) {
    console.error("Failed at bind group setup stage: ", error);
  }
}

/**
 * Updates quaternion & renders new frame.
 * 
 * @function renderFrame
 * @param {} quaternionValue
 * @return {void}
 */
class RenderEngine {
  constructor() {
    /// --!! class setup !!-- \\\    
    // -- accumulated rotation (identity = no rotation) -- \\
    this.rotation = new Quaternion(0.0, 0.0, 0.0, 1.0);

    // -- drag tracker -- \\
    this.isDragging = false;
    this.previousPointer = { x: 0.0, y: 0.0 };

    // -- pointer bookkeeping for pinch -- \\
    this.activePointers = new Map();
    this.initialPinchDist = 0.0;
    this.scale = 1.0;

    // -- drag sensitivity (radians per pixel) -- \\
    this.dragSensitivity = 0.005;

    // -- reusable scratch matrix to avoid GC -- \\
    this.matrix = new Float32Array(16);
    
    /// -- setup calls -- \\\
    this.establishPointerListeners();
    this.awake().then(() => {
      requestAnimationFrame(this.renderFrame.bind(this))
    });
  }
  async awake() {
    this.webGPUContext = await setupWebGPUContext();
    if (!this.webGPUContext) {
      console.error("WebGPU not available.");
      return;
    }
    setupCanvasContext(canvas, brush, this.webGPUContext.device, this.webGPUContext.format);
    wgpu.module = await compileShader(this.webGPUContext.device, wgpu.shader);
    await awakeRenderPipeline(this.webGPUContext.device, this.webGPUContext.format);
    awakeTextures(canvas, this.webGPUContext.device, this.webGPUContext.format);
    awakeBuffers(this.webGPUContext.device);
    awakeBindGroup(this.webGPUContext.device);
  }

  establishPointerListeners() {
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
      if (this.activePointers.size === 1) {
        // << single-pointer drag mode >>
        this.isDragging = true;
        this.previousPointer = { x: e.clientX, y: e.clientY };
      } else if (this.activePointers.size === 2) {
        // << pinch mode: reset drag so we don't jump >>
        this.isDragging = false;
        const pts = Array.from(this.activePointers.values());
        this.initialPinchDist = Math.hypot(
          pts[1].x - pts[0].x,
          pts[1].y - pts[0].y
        );
      }
    });
  
    canvas.addEventListener('pointermove', (e) => {
      if (!this.activePointers.has(e.pointerId)) return;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
      if (this.activePointers.size === 1 && this.isDragging) {
        this.dx = e.clientX - this.previousPointer.x;
        this.dy = e.clientY - this.previousPointer.y;
      
        // << convert this frame's drag into a delta rotation >>
        this.dq = dragToQuaternion(this.dx, this.dy);
      
        // << compose with accumulated rotation, then renormalize >>
        // << world-space composition: new rotation applied to the LEFT >>
        this.rotation = this.dq.multiply(this.rotation).normalize();
      
        this.previousPointer = { x: e.clientX, y: e.clientY };
      }
      // << pinch is a no-op for Cube1.js (no scale buffer) >>
    });
  
    const handlePointerEnd = (e) => {
      this.activePointers.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    
      // << exit drag mode when no pointers remain >>
      if (this.activePointers.size === 0) {
        this.isDragging = false;
      } else if (this.activePointers.size === 1) {
        // << transitioned from 2-finger pinch back to 1-finger: resume drag >>
        const [only] = Array.from(this.activePointers.values());
        this.previousPointer = { x: only.x, y: only.y };
        this.isDragging = true;
      }
    };
  
    canvas.addEventListener('pointerup', handlePointerEnd);
    canvas.addEventListener('pointercancel', handlePointerEnd);
  }
  
  renderFrame() {
    // << safety check >> \\
    if (!wgpu.module || !wgpu.pipeline || !wgpu.bindGroup) {
      return;
    }
    
    // << update position & buffer >> \\
    this.matrix.set(this.rotation.toMatrix4());
    this.webGPUContext.device.queue.writeBuffer(wgpu.buffers.quaternion, 0, this.matrix);

    // << encoder & pass >> \\
    wgpu.encoder = this.webGPUContext.device.createCommandEncoder();
    wgpu.pass = wgpu.encoder.beginRenderPass({
      colorAttachments: [{
        view: wgpu.textures.msaa.createView(),      
        resolveTarget: brush.getCurrentTexture().createView(),      
        clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'discard'
      }],
      depthStencilAttachment: {
        view: wgpu.textures.depth.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    });

    // << draw >> \\
    wgpu.pass.setPipeline(wgpu.pipeline);
    wgpu.pass.setBindGroup(0, wgpu.bindGroup);
    wgpu.pass.draw(36);
    wgpu.pass.end();

    this.webGPUContext.device.queue.submit([ wgpu.encoder.finish() ]);

    requestAnimationFrame(this.renderFrame.bind(this))
  }
}

window.addEventListener('load', () => {
  try {
    const engine = new RenderEngine();
    awakeFPSLogger();
    console.log("AWAKENED!!");
  } catch (error) {
    console.error(error);
  }
});