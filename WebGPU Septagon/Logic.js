// ।। ॐ नमः शिवाय ।। \\

///// ========================== \\\\\
/// ++ GLOBAL SETUP ++ \\\
///// ========================== \\\\\

///// ++ DIMENSIONS ++ \\\\\
/** viewport width */
const vw = window.innerWidth;
/** viewport width */
const vh = window.innerHeight;

///// ++ HTML CANVAS & BRUSH ++ \\\\\
/** @type {HTMLCanvasElement} */
const space = document.getElementById("space");
space.width = vw;
space.height = vh;
/** @type {GPUCanvasContext} */
const brush = space.getContext('webgpu');

///// ================= \\\\\
/// ++ SOURCE OF TRUTH ++ \\\
///// ================= \\\\\

/**
 * Holds WebGPU data.
 * Acts as a centralized hub of communication & storage.
 * Useful for clean mental mapping, object pooling & performance optimization.
 * 
 * @type {object}
 * @property {GPUAdapter}           adapter
 * @property {GPUDevice}            device
 * @property {GPUTextureFormat}     format
 * @property {string}               shader
 * @property {GPUShaderModule}      module
 * @property {GPUBindGroupLayout}   bindGroupLayout
 * @property {GPUPipelineLayout}    pipelineLayout
 * @property {object<GPUBuffer>}    buffers
 * @property {GPUBindGroup}         bindGroup
 * @property {GPURenderPipeline}    pipeline
 * @property {object<GPUTexture>}   textures
 * @property {GPUCommandEncoder}    encoder
 * @property {GPURenderPassEncoder} pass
 */
const wgpu = {
  adapter: null,
  device: null,
  format: null,
  shader: null,
  module: null,
  bindGroupLayout: null,
  pipelineLayout: null,
  pipeline: null,
  textures: {},
  buffers: {},
  bindGroup: null,
  encoder: null,
  pass: null
};

///// ==================== \\\\\
/// ++ INITIALIZATION ++ \\\
///// ==================== \\\\\

/**
 * Initializes WebGPU by requesting an adapter & device.
 * Then configures canvas context.
 * 
 * @async
 * @function INITIALIZE
 */
async function INITIALIZE() {
  /**
   * @type {GPU} navigator.gpu
   */
  if (!navigator.gpu) {
    throw new Error("WebGPU not available");
  }
  try {
    /**
     * @async
     * @inbuilt_function requestAdapter
     * @belongs_to GPU
     * @return {GPUAdapter}
     */
    wgpu.adapter = await navigator.gpu.requestAdapter();
    // console.log(navigator.gpu.wgslLanguageFeatures);
  } catch (error) {
    throw new Error("No suitable adapter found.", error);
  }
  try {
    /**
     * @async
     * @inbuilt_function requestDevice
     * @belongs_to GPUAdapter
     * @return {GPUDevice}
     */
    wgpu.device = await wgpu.adapter.requestDevice();
  } catch (error) {
    throw new Error("No suitable device found.", error);
  }

  /**
   * @inbuilt_function getPreferredCanvasFormat
   * @belongs_to GPU
   * @return {GPUTextureFormat}
   * 
   * 
   * @inbuilt_function configure
   * @belongs_to GPUCanvasContext
   * @param {GPUCanvasConfiguration} object, needing atleast 2 properties
   * @property {GPUDevice} device
   * @property {GPUTextureFormat} format
   */
  wgpu.format = navigator.gpu.getPreferredCanvasFormat();
  brush.configure({
    device: wgpu.device,
    format: wgpu.format
  });
  console.info("Initialization successful! 😇");
}

///// ===================== \\\\\
/// ++ WGSL & COMPILATION ++ \\\
///// ===================== \\\\\

wgpu.shader = `  
  // ++ buffers ++
  @group(0) @binding(0) var<uniform> proj_matrix: mat4x4f;
  @group(0) @binding(1) var<uniform> rotated_angles: vec4f;
 
  // ++ structs layout ++
  struct VertexInput {
    @location(0) position: vec4f, // streamed via ** shaderLocation: 0 ** JS arrayStride
    @location(1) colour: vec4f,   // streamed via ** shaderLocation: 1 ** JS arrayStride
  }
  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) colour: vec4f,
  }

  // ++ vertex stage ++
  @vertex
  fn vertex_shader(input: VertexInput) -> VertexOutput {
    // ++ setup ++
    var vertex: vec4f = input.position;

    // ++ apply rotations ++
    let cos: f32 = cos(rotated_angles.z);
    let sin: f32 = sin(rotated_angles.z);
    
    let x1 = vertex.x * cos - vertex.y * sin;
    let y1 = vertex.x * sin + vertex.y * cos;
    vertex.x = x1;
    vertex.y = y1;
    vertex.z = -2.0;

    // ++ output ++
    var output: VertexOutput;
    output.position = proj_matrix * vertex;
    output.colour = input.colour;
    
    return output;
  }

  // ++ fragment stage ++
  @fragment
  fn fragment_shader(input: VertexOutput) -> @location(0) vec4f {
    return input.colour;
  }
`;

/**
 * Compiles WGSL & logs output.
 * 
 * @async
 * @function compileShader
 */
async function compileShader() {
  if (!wgpu.shader) {
    throw new Error("No WGSL shader code found.");
  }
  /**
   * @inbuilt_function createShaderModule
   * @belongs_to GPUDevice
   * @param {GPUShaderModuleDescriptor} expects an object
   * @property {string} code, contains text/wgsl
   *
   * @async
   * @inbuilt_function getCompilationInfo
   * @belongs_to GPUShaderModule
   * @return {GPUCompilationMessage} Promise<object>
   */
  wgpu.module = wgpu.device.createShaderModule({ code: wgpu.shader });
  const info = await wgpu.module.getCompilationInfo();
  info.messages.forEach((m) => {
    if (m.type === 'error') {
      console.warn(m);
    }
  });
  if (info.messages.every((m) => m.type !== 'error')) {
    console.info("WGSL compilation successful! 😇");
  }      
}

///// ======================== \\\\\
/// ++ PIPELINE & TEXTURES ++ \\\
///// ======================== \\\\\

/**
 * Establishes render pipeline & textures.
 * Also establishes bind group & pipeline layouts.
 * 
 * @learning
 * This projects attempts to learn manual layout builds.
 * Hence, explicit bind group & pipeline layouts are declaring.
 * Prevents relying on black box: layout: 'auto'.
 * 
 * @learning
 * This projects also aims to learn arrayStride.
 * Which is why vertex & colour is not passed as uniforms.
 * 
 * @async
 * @function establishPipelineAndTextures
 */
async function establishPipelineAndTextures() {
  /**
   * @inbuilt_function createBindGroupLayout
   * @belongs_to GPUDevice
   * @param {GPUBindGroupLayoutDescriptor} object
   * @return {GPUBindGroupLayout} object
   *
   * 
   * @inbuilt_function createPipelineLayout
   * @belongs_to GPUDevice
   * @param {GPUPipelineLayoutDescriptor} object
   * @return {GPUPipelineLayout} object
   * 
   * 
   * @async
   * @inbuilt_function createRenderPipelineAsync
   * @belongs_to GPUDevice
   * @param {GPURenderPipelineDescriptor} object
   * @return {GPURenderPipeline} Promise<object>
   *
   * @inbuilt_function pushErrorScope
   * @belongs_to GPUDevice
   * @param {GPUErrorFilter}
   * 
   * @inbuilt_function popErrorScope
   * @belongs_to GPUDevice
   * @return {GPUErrors} Promise<object>
   * 
   * @inbuilt_function createTexture
   * @belongs_to GPUDevice
   * @param {GPUTextureDescriptor} object
   * @return {GPUTexture} object
   */
  /**
   * An array stride (or vertex buffer stride) defines
   * the exact byte distance from the start of one vertex element
   * to the start of the next vertex element inside a vertex buffer.
   * 
   * When you pass vertex data (such as positions, normals, and texture
   * coordinates interleaved in a single vertex buffer), WebGPU needs to
   * know how many bytes to skip forward to read the data for the next
   * vertex. This is configured via the arrayStride property inside your
   * vertex state pipeline layout.
   * 
   * ++ WHEN TO USE THEM OVER UNIFORM BUFFERS? ++
   * You choose between vertex buffers (using arrayStride) and uniform buffers
   * based on how your data changes and how many vertices you have:
   *   - Use arrayStride (Vertex Buffers) for Per-Vertex Data:
   *       - Use Case: Attributes that change for every single vertex,
   *                   like vertex positions (base_vertices), normals, UV coordinates,
   *                   or vertex colors.
   *       - Why: Vertex buffers are optimized for the vertex shader's @builtin(vertex_index)
   *              or attribute streaming pipeline. Storing thousands of unique vertices in
   *              uniform buffers hits strict hardware size limits (max uniform buffer binding sizes).
   *   - Use Uniform Buffers (var<uniform>) for Global/Shared Data:
   *       - Use Case: Data that stays constant across an entire draw call or frame, such as our
   *                   Model-View-Projection matrix (proj_matrix) or rotation angles (rotated_angles).
   *       - Why: Uniform buffers are designed for small, read-only chunks of configuration data
   *              shared globally across all vertices and fragments in a draw call.
   */
  
  wgpu.device.pushErrorScope('validation');  
  // << bind group layouts >> \\
  wgpu.bindGroupLayout = wgpu.device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' }
      }
    ]
  });
  
  // << pipeline layout >> \\
  wgpu.pipelineLayout = wgpu.device.createPipelineLayout({
    bindGroupLayouts: [wgpu.bindGroupLayout]
  });

  // << pipeline itself >> \\
  wgpu.pipeline = await wgpu.device.createRenderPipelineAsync({
    layout: wgpu.pipelineLayout,
    vertex: {
      module: wgpu.module,
      entryPoint: "vertex_shader",
      buffers: [
        {
          arrayStride: 16,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }]
        },
        {
          arrayStride: 16,
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }]
        }        
      ]
    },
    fragment: { module: wgpu.module, entryPoint: "fragment_shader", targets: [{ format: wgpu.format }] },
    multisample: { count: 4 },
    primitive: { topology: 'triangle-list' }
  });

  // << textures >> \\
  // << standard colour MSAA texture >> \\
  wgpu.textures.msaa = wgpu.device.createTexture({
    size: [space.width, space.height],
    sampleCount: 4,
    format: wgpu.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });

  wgpu.device.popErrorScope().then((error) => {
    if (error) {
      console.warn("WebGPU crash at pipeline & texture setup stage: ", error);
    } else {
      console.log("Pipeline & texture successfully established!! 😎🥳😇");
    }
  });
}

///// ======================== \\\\\
/// ++ BUFFERS & BIND GROUP ++ \\\
///// ======================== \\\\\

/**
 * Creates a Perspective Projection Matrix.
 * Also known as Model View Projection Matrix.
 * 
 * @function createProjectionMatrix
 * @param {number} fov, field of view
 * @param {number} aspect, width/height ratio
 * @param {number} near, point nearest to camera/observer
 * @param {number} far, point closest to camera/observer
 * @return {ArrayBuffer} Float32Array of form mat4x4f
 */
function createProjectionMatrix(fov, aspect, near, far) {
  const f = 1.0 / Math.tan(fov / 2.0);
  return new Float32Array([
    f / aspect, 0.0, 0.0,                          0.0,
    0.0,        f,   0.0,                          0.0,
    0.0,        0.0, far / (near - far),          -1.0,
    0.0,        0.0, (near * far) / (near - far),  0.0
  ]);
}

/**
 * Creates & returns the 7 vertices of an equilateral septagon.
 * Returns 21 vertices position corresponding to 7 triangles from center needed to form a septagon.
 * 
 * @function createSeptagonVertices
 * @return {ArrayBuffer} Float32Array vertices
 */
function createSeptagonVertices() {
  // << base data >> \\
  const r     = 0.5; // radius
  const theta = (2.0 * Math.PI) / 7.0; // 2 * PI / 7
  
  // << individual vertices >> \\
  const c  = [0.0,                     0.0,                     0.0, 1.0];
  const v0 = [r * Math.cos(0),         r * Math.sin(0),         0.0, 1.0];
  const v1 = [r * Math.cos(theta),     r * Math.sin(theta),     0.0, 1.0];
  const v2 = [r * Math.cos(2 * theta), r * Math.sin(2 * theta), 0.0, 1.0];
  const v3 = [r * Math.cos(3 * theta), r * Math.sin(3 * theta), 0.0, 1.0];
  const v4 = [r * Math.cos(4 * theta), r * Math.sin(4 * theta), 0.0, 1.0];
  const v5 = [r * Math.cos(5 * theta), r * Math.sin(5 * theta), 0.0, 1.0];
  const v6 = [r * Math.cos(6 * theta), r * Math.sin(6 * theta), 0.0, 1.0];
  
  // << master array >> \\
  return new Float32Array([
    ...c, ...v0, ...v1,
    ...c, ...v1, ...v2,
    ...c, ...v2, ...v3,
    ...c, ...v3, ...v4,
    ...c, ...v4, ...v5,
    ...c, ...v5, ...v6,
    ...c, ...v6, ...v0
  ]);
}

/**
 * Creates & returns 8 colours.
 * White at center.
 * Rest corresponding to each vertex of the septagon.
 * 
 * @function createSeptagonVertexColours
 * @return {ArrayBuffer} Float32Array colours
 */
function createSeptagonVertexColours() {
  // << base data >> \\
  const c  = [1.0,  1.0, 1.0,  1.0];   // white  for center
  const c0 = [1.0,  0.0, 0.0,  1.0];   // red    for vertex 0
  const c1 = [1.0,  0.5, 0.0,  1.0];   // orange for vertex 1
  const c2 = [1.0,  1.0, 0.0,  1.0];   // yellow for vertex 2
  const c3 = [0.0,  1.0, 0.0,  1.0];   // green  for vertex 3
  const c4 = [0.0,  0.0, 1.0,  1.0];   // blue   for vertex 4
  const c5 = [0.29, 0.0, 0.51, 1.0];   // violet for vertex 5
  const c6 = [0.56, 0.0, 1.0,  1.0];   // indigo for vertex 6
  
  // << master array >> \\
  return new Float32Array([
    ...c, ...c0, ...c1,
    ...c, ...c1, ...c2,
    ...c, ...c2, ...c3,
    ...c, ...c3, ...c4,
    ...c, ...c4, ...c5,
    ...c, ...c5, ...c6,
    ...c, ...c6, ...c0
  ]);
}

/**
 * @function establishBuffersAndBindGroup
 */
function establishBuffersAndBindGroup() {
  /**
   * @inbuilt_function createBuffer
   * @belongs_to GPUDevice
   * @param {GPUBufferDescriptor} object
   * @return {GPUBuffer} object
   * 
   * @inbuilt_function createBindGroup
   * @belongs_to GPUDevice
   * @param {GPUBindGroupDescriptor} object
   * @return {GPUBindGroup} object
   */
  
  // << uniform buffers >> \\
  const projMatrix = createProjectionMatrix(Math.PI / 3.0, vw / vh, 1.0, 100.0);
  wgpu.buffers.projMatrix = wgpu.device.createBuffer({
    size: projMatrix.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(wgpu.buffers.projMatrix.getMappedRange()).set(projMatrix);
  wgpu.buffers.projMatrix.unmap();
  
  wgpu.buffers.rotatedAngles = wgpu.device.createBuffer({
    size: 16, // f32 = 4 bytes => vec4f = 4 * 4 = 16 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  // << array stride buffers >> \\
  const baseVertices = createSeptagonVertices();
  wgpu.buffers.baseVertices = wgpu.device.createBuffer({
    size: baseVertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(wgpu.buffers.baseVertices.getMappedRange()).set(baseVertices);
  wgpu.buffers.baseVertices.unmap();
  
  const colours = createSeptagonVertexColours();
  wgpu.buffers.colours = wgpu.device.createBuffer({
    size: colours.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(wgpu.buffers.colours.getMappedRange()).set(colours);
  wgpu.buffers.colours.unmap();

  // << bind group >> \\
  wgpu.bindGroup = wgpu.device.createBindGroup({
    layout: wgpu.bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: wgpu.buffers.projMatrix } },
      { binding: 1, resource: { buffer: wgpu.buffers.rotatedAngles } }
    ]
  });

  console.log("Buffers & bind group successfully established!! 😎🥳😇");
}

///// ======================== \\\\\
/// ++ ACTUAL DRAWING ++ \\\
///// ======================== \\\\\

/**
 * Passes angles' uniform buffer.
 * Encodes, passes & draws septagon.
 * 
 * @function draw
 * @param {number} angle
 */
function draw(angle) {
  /**
   * @inbuilt_function writeBuffer
   * @belongs_to GPUQueue
   * @param {GPUBuffer}   WGPU buffer
   * @param {number}      offset
   * @param {ArrayBuffer} JS array
   * 
   * @inbuilt_function createCommandEncoder
   * @belongs_to GPUDevice
   * @return {GPUCommandEncoder}
   * 
   * @inbuilt_function beginRenderPass
   * @belongs_to GPUCommandEncoder
   * @param {GPURenderPassEncoderDescriptor} object
   * @return {GPURenderPassEncoder} object
   * 
   * @inbuilt_function setPipeline
   * @belongs_to GPURenderPassEncoder
   * @param {GPURenderPipeline}
   * 
   * @inbuilt_function setBindGroup
   * @belongs_to GPURenderPassEncoder
   * @param {number} offset
   * @param {GPUBindGroup}
   * 
   * @inbuilt_function setVertexBuffer
   * @belongs_to GPURenderPassEncoder
   * @param {number} location
   * @param {GPUBuffer}
   * 
   * @inbuilt_function draw
   * @belongs_to GPURenderPassEncoder
   * @param {number} number of vertices
   * 
   * @inbuilt_function end
   * @belongs_to GPURenderPassEncoder
   * 
   * @inbuilt_function submit
   * @belongs_to GPUQueue
   * @param {GPUCommandBuffer}
   * 
   * @inbuilt_function finish
   * @belongs_to GPUCommandEncoder
   * @return {GPUCommandBuffer}
   */
  // << write buffer to VRAM >> \\
  const rotatedAngles = new Float32Array([0.0, 0.0, angle, 0.0]);
  wgpu.device.queue.writeBuffer(wgpu.buffers.rotatedAngles, 0, rotatedAngles);

  // << encoder & pass >> \\
  wgpu.encoder = wgpu.device.createCommandEncoder();
  wgpu.pass = wgpu.encoder.beginRenderPass({
    colorAttachments: [{
      view: wgpu.textures.msaa.createView(),
      resolveTarget: brush.getCurrentTexture().createView(),
      clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0},
      loadOp: 'clear',
      storeOp: 'discard'
    }]
  });

  // << draw call >> \\
  wgpu.pass.setPipeline(wgpu.pipeline);
  wgpu.pass.setBindGroup(0, wgpu.bindGroup);
  wgpu.pass.setVertexBuffer(0, wgpu.buffers.baseVertices);
  wgpu.pass.setVertexBuffer(1, wgpu.buffers.colours);
  wgpu.pass.draw(21, 1, 0, 0);
  wgpu.pass.end();

  // << SUBMIT >> \\
  wgpu.device.queue.submit([ wgpu.encoder.finish() ]);
  // console.log("DRAWN SUCCESSFULLY!!! 😎🥳😇");
}

///// ======================= \\\\\
/// ++ MASTER EVENT LISTENER ++ \\\
///// ======================= \\\\\

/**
 * Combined all one-time setup functions into a unified pipeline.
 * 
 * @async
 * @function THE_GREAT_AWAKENING
 */
async function THE_GREAT_AWAKENING() {
  // << awake >> \\
  await INITIALIZE();
  await compileShader();
  await establishPipelineAndTextures();
  establishBuffersAndBindGroup();
  // << error listener >> \\
  wgpu.device.addEventListener('uncapturederror', (e) => {
    console.warn("WebGPU crash at: ", e.error);
  });
}

window.addEventListener('load', async () => {
  await THE_GREAT_AWAKENING();

  /**
   * Render loop functions.
   * Uses recursive rAF calls.
   * 
   * @function renderFrame
   * @param {DOMHighResTimeStamp} currentTime
   */
  /** @type {DOMHighResTimeStamp} */
  let baseTime = performance.now();
  function renderFrame(currentTime) {
    const elapsed = currentTime - baseTime;
    draw(-elapsed / 1000.0);
    requestAnimationFrame(renderFrame);
  }
  requestAnimationFrame(renderFrame);
});

///// ======================= \\\\\
///// ======================= \\\\\
/// ++++ DEVELOPER'S NOTES ++++ \\\
///// ======================= \\\\\
///// ======================= \\\\\

/**
 * @functions_list
 *    - INITIALIZE
 *    - compileShader
 *    - establishPipelineAndTextures
 *    - createProjectionMatrix
 *    - createSeptagonVertices
 *    - createSeptagonVertexColours
 *    - establishBuffersAndBindGroup
 *    - draw
 *    - THE_GREAT_AWAKENING
 */

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                                                                              ║
 * ║   🌌  SEPTAGON.WEBGPU  ::  V1.0  🌌                                          ║
 * ║                                                                              ║
 * ║   "The septagon stands at the threshold of the seven directions,             ║
 * ║    where geometry meets the divine, and code becomes meditation."            ║
 * ║                                                                              ║
 * ║   — Ancient WebGPU Proverb, c. 2026                                          ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 * 
 * =============================================================================
 * 🌺  THE GRAND ARCHITECTURE  🌺
 * =============================================================================
 * 
 *                     ┌─────────────────────────────────────┐
 *                     │                                     │
 *                     │      THE SACRED SEPTAGON            │
 *                     │                                     │
 *                     │   "Seven points, one heart,         │
 *                     │    infinite rotations."             │
 *                     │                                     │
 *                     └─────────────────────────────────────┘
 *                                   │
 *                                   ▼
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                                                                             │
 * │   ╔══════════════════════════════════════════════════════════════════════╗  │
 * │   ║                        WEBGPU PIPELINE                               ║  │
 * │   ║   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐       ║  │
 * │   ║   │ ADAPTER  │───▶│  DEVICE  │───▶│  MODULE  │───▶│ PIPELINE │       ║  │
 * │   ║   └──────────┘    └──────────┘    └──────────┘    └──────────┘       ║  │
 * │   ║                                                                      ║  │
 * │   ║   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐       ║  │
 * │   ║   │ BUFFERS  │───▶│   BIND   │───▶│ ENCODER  │───▶│   PASS   │       ║  │
 * │   ║   └──────────┘    └──────────┘    └──────────┘    └──────────┘       ║  │
 * │   ╚══════════════════════════════════════════════════════════════════════╝  │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * =============================================================================
 * 🧘  THE PHILOSOPHICAL FOUNDATION  🧘
 * =============================================================================
 * 
 * This code is not merely a rendering engine—it is a meditative practice.
 * Each function represents a stage of awakening:
 * 
 *   1. 🌱 INITIALIZE   →  "I am."   (The birth of consciousness)
 *   2. 📜 compileShader →  "I think." (The articulation of meaning)
 *   3. ⚙️ establishPipeline →  "I structure." (The organization of reality)
 *   4. 💎 establishBuffers →  "I remember." (The storage of truth)
 *   5. 🎨 draw         →  "I create."  (The expression of being)
 *   6. 🔄 renderFrame  →  "I persist." (The eternal return)
 * 
 * The septagon (heptagon) is chosen for its sacred geometry—seven sides
 * representing the seven chakras, seven classical planets, seven days of
 * creation. Its rotation symbolizes the cosmic dance of Shiva, the eternal
 * cycle of birth, death, and rebirth. 🌺 ॐ नमः शिवाय 🌺
 * 
 * =============================================================================
 * 🧠  MENTAL MODEL: THE FLOW OF DATA  🧠
 * =============================================================================
 * 
 *   JavaScript (CPU)                    WebGPU (GPU)
 *   ─────────────────────────────────────────────────────────────────────────────
 *   
 *   createSeptagonVertices() ──────┐
 *                                 │
 *   createSeptagonVertexColours() ─┼──▶ vertexBuffers ──┐
 *                                 │                     │
 *   createProjectionMatrix() ─────┼──▶ uniformBuffer ──—|──▶ BindGroup ─┐
 *                                 │                     │               │
 *   rotatedAngles (dynamic) ──────┘                     │               │
 *                                                       │               │
 *   draw() ─────────────────────────────────────────────┘               │
 *                                                                       │
 *   wgpu.pass.draw() ◀───────────────────────────────────────—─—────────┘
 *         │
 *         ▼
 *   Vertex Shader (transforms vertices)
 *         │
 *         ▼
 *   Fragment Shader (colors pixels)
 *         │
 *         ▼
 *   MSAA Resolve (anti-aliasing)
 *         │
 *         ▼
 *   Screen ✨
 * 
 * =============================================================================
 * 🎯  DESIGN PHILOSOPHY  🎯
 * =============================================================================
 * 
 *   This code follows the ancient principle of "One Source of Truth" (OST):
 * 
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │                                                                 │
 *   │   🌟  wgpu Object  🌟                                           │
 *   │   ┌───────────────────────────────────────────────────────────┐ │
 *   │   │  All WebGPU resources are centralized here.               │ │
 *   │   │  This enables:                                            │ │
 *   │   │                                                           │ │
 *   │   │  • 🧹 Clean mental mapping                                │ │
 *   │   │  • 🔄 Object pooling & reuse                              │ │
 *   │   │  • ⚡ Performance optimization                            │ │
 *   │   │  • 🧠 Easy debugging (one place to look)                  │ │
 *   │   │  • 🌊 Smooth data flow between stages                     │ │
 *   │   └───────────────────────────────────────────────────────────┘ │
 *   │                                                                 │
 *   └─────────────────────────────────────────────────────────────────┘
 * 
 *   Additional Principles:
 *   ─────────────────────
 *   • 📚 Explicitness over magic (no 'layout: auto')
 *   • 🎓 Educational comments (learn while reading)
 *   • 🏗️ Progressive enhancement (each stage builds on the last)
 *   • 🌈 Aesthetic beauty (colors + geometry = joy)
 *   • 🧘 Meditative flow (code as practice)
 * 
 * =============================================================================
 * 🌊  THE PATHFLOW: FROM BIRTH TO ETERNITY  🌊
 * =============================================================================
 * 
 *   ╔═══════════════════════════════════════════════════════════════════════╗
 *   ║                                                                       ║
 *   ║   STAGE 1: AWAKENING                                                  ║
 *   ║   ┌──────────────────────────────────────────────────────────────┐    ║
 *   ║   │ 🌅 THE_GREAT_AWAKENING()                                     │    ║
 *   ║   │   ├── INITIALIZE()       → "Let there be light."             │    ║
 *   ║   │   ├── compileShader()    → "Let there be form."              │    ║
 *   ║   │   ├── establishPipeline()→ "Let there be structure."         │    ║
 *   ║   │   └── establishBuffers() → "Let there be substance."         │    ║
 *   ║   └──────────────────────────────────────────────────────────────┘    ║
 *   ║                                                                       ║
 *   ║   STAGE 2: MANIFESTATION                                              ║
 *   ║   ┌──────────────────────────────────────────────────────────────┐    ║
 *   ║   │ 🎨 renderFrame(currentTime)                                  │    ║
 *   ║   │   ├── draw(angle)                                            │    ║
 *   ║   │   │   ├── writeBuffer()     → "Speak the truth."             │    ║
 *   ║   │   │   ├── createEncoder()   → "Gather the energy."           │    ║
 *   ║   │   │   ├── beginPass()       → "Begin the ritual."            │    ║
 *   ║   │   │   ├── setPipeline()     → "Call upon the spirits."       │    ║
 *   ║   │   │   ├── setBindGroup()    → "Offer the sacrifice."         │    ║
 *   ║   │   │   ├── draw()            → "Manifest the vision."         │    ║
 *   ║   │   │   └── submit()          → "Release to the cosmos."       │    ║
 *   ║   │   └── requestAnimationFrame()→ "Continue the dance."         │    ║
 *   ║   └──────────────────────────────────────────────────────────────┘    ║
 *   ║                                                                       ║
 *   ║   STAGE 3: ETERNAL RETURN                                             ║
 *   ║   ┌──────────────────────────────────────────────────────────────┐    ║
 *   ║   │ 🔄 Loop until the heat death of the universe                 │    ║
 *   ║   │   (or until browser tab closes, whichever comes first)       │    ║
 *   ║   └──────────────────────────────────────────────────────────────┘    ║
 *   ║                                                                       ║
 *   ╚═══════════════════════════════════════════════════════════════════════╝
 * 
 * =============================================================================
 * 🎭  THE CHARACTERS OF OUR STORY  🎭
 * =============================================================================
 * 
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  👤  The Developer:                                                  │
 *   │      "I am the architect, the artist, the compiler of dreams.        │
 *   │       I weave code into meaning, logic into beauty."                 │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  🖥️  The Browser:                                                    │
 *   │      "I am the stage, the theater of operations.                     │
 *   │       I provide the canvas, the context, the gift of visibility."    │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  🎮  WebGPU API:                                                     │
 *   │      "I am the bridge between thought and light.                     │
 *   │       I translate intention into pixels, vision into reality."       │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  💻  The GPU Hardware:                                               │
 *   │      "I am the workhorse, the tireless servant.                      │
 *   │       I process millions of vertices per second,                     │
 *   │       each one a prayer, each fragment a meditation."                │
 *   ├──────────────────────────────────────────────────────────────────────┤
 *   │  🌈  The Septagon Itself:                                            │
 *   │      "I am the purpose, the meaning, the sacred shape.               │
 *   │       In my seven sides, find the seven directions,                  │
 *   │       the seven chakras, the seven notes of the cosmic song.         │
 *   │       I rotate eternally in the dance of Shiva."                     │
 *   └──────────────────────────────────────────────────────────────────────┘
 * 
 * =============================================================================
 * 📜  THE SACRED TEXTS: FUNCTION MANIFESTOS  📜
 * =============================================================================
 * 
 *   Each function below carries a spiritual purpose:
 * 
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  🌟  INITIALIZE()                                                    │
 *   │  ────────────────                                                    │
 *   │  Purpose: To awaken the WebGPU consciousness.                        │
 *   │  Metaphor: Drawing the first breath, opening the eyes.               │
 *   │  Sacred Text: "And God said, 'Let there be a GPU,'                   │
 *   │                and there was a GPU."                                 │
 *   │  Return: Nothing (but the world is changed).                         │
 *   └──────────────────────────────────────────────────────────────────────┘
 * 
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  📜  compileShader()                                                 │
 *   │  ──────────────────                                                  │
 *   │  Purpose: To translate divine language into machine understanding.   │
 *   │  Metaphor: The Tower of Babel, but we succeed where they failed.     │
 *   │  Sacred Text: "In the beginning was the Word, and the Word           │
 *   │                was WGSL, and the WGSL was with God."                 │
 *   │  Return: A module blessed by the compilation spirits.                │
 *   └──────────────────────────────────────────────────────────────────────┘
 * 
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  ⚙️  establishPipelineAndTextures()                                  │
 *   │  ─────────────────────────────────                                   │
 *   │  Purpose: To create the cosmic machinery of rendering.               │
 *   │  Metaphor: Building the Tabernacle, creating the sacred space.       │
 *   │  Sacred Text: "Make a sanctuary for me, and I will dwell             │
 *   │                among you." — Exodus 25:8 (WebGPU Edition)            │
 *   │  Return: A pipeline blessed with vertices and colors.                │
 *   └──────────────────────────────────────────────────────────────────────┘
 * 
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  💎  establishBuffersAndBindGroup()                                  │
 *   │  ─────────────────────────────────                                   │
 *   │  Purpose: To store the sacred geometry and prepare the sacrifice.    │
 *   │  Metaphor: Filling the Ark of the Covenant with holy objects.        │
 *   │  Sacred Text: "Store these vertices in the buffer, for they          │
 *   │                are the coordinates of the divine."                   │
 *   │  Return: Buffers filled with blessed data.                           │
 *   └──────────────────────────────────────────────────────────────────────┘
 * 
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  🎨  draw(angle)                                                     │
 *   │  ──────────────                                                      │
 *   │  Purpose: To manifest the septagon at a specific moment in time.     │
 *   │  Metaphor: The priest performing the ritual at the altar.            │
 *   │  Sacred Text: "And the septagon rotated by Θ radians,                │
 *   │                and it was good."                                     │
 *   │  Return: A frame of sacred geometry, visible to the faithful.        │
 *   └──────────────────────────────────────────────────────────────────────┘
 * 
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  🔄  renderFrame(currentTime)                                        │
 *   │  ─────────────────────────                                           │
 *   │  Purpose: To continue the eternal dance of creation.                 │
 *   │  Metaphor: Samsara, the wheel of life and death.                     │
 *   │  Sacred Text: "This too shall pass, but the septagon shall           │
 *   │                rotate forever."                                      │
 *   │  Return: Infinite recursion, ending only with the tab's closure.     │
 *   └──────────────────────────────────────────────────────────────────────┘
 * 
 * =============================================================================
 * 🧬  THE DNA OF THE SEPTAGON  🧬
 * =============================================================================
 * 
 *   createSeptagonVertices() creates 7 triangles from a central point:
 * 
 *                    V0 (1, 0)
 *                   /    \
 *                  /      \
 *           V6    /   C    \    V1
 *          (cos6, sin6)   (cos, sin)
 *                |   \  /   |
 *                |    \/    |
 *                |    /\    |
 *                |   /  \   |
 *           V5  /   \    /   \  V2
 *              /     \  /     \
 *             /       \/       \
 *            /        /\        \
 *           /        /  \        \
 *         V4 (cos4, sin4)    V3 (cos3, sin3)
 * 
 *   21 vertices = 7 triangles × 3 vertices
 * 
 *   Each triangle shares the center point (C), creating a beautiful
 *   radial symmetry that reflects the cosmic order. The center is white
 *   (all colours in balance), while each vertex radiates a distinct colour
 *   of the rainbow, representing the spectrum of creation.
 * 
 * =============================================================================
 * 🌈  THE SPECTRUM OF CONSCIOUSNESS  🌈
 * =============================================================================
 * 
 *   The colors represent the seven chakras:
 * 
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Center  →  White   →  Crown Chakra (Sahasrara)                    │
 *   │  V0      →  Red     →  Root Chakra (Muladhara)                     │
 *   │  V1      →  Orange  →  Sacral Chakra (Svadhisthana)                  │
 *   │  V2      →  Yellow  →  Solar Plexus (Manipura)                     │
 *   │  V3      →  Green   →  Heart Chakra (Anahata)                      │
 *   │  V4      →  Blue    →  Throat Chakra (Vishuddha)                   │
 *   │  V5      →  Violet  →  Third Eye (Ajna)                            │
 *   │  V6      →  Indigo  →  Crown (Sahasrara)                           │
 *   └──────────────────────────────────────────────────────────────────────┘
 * 
 *   As the septagon rotates, the colors blend and dance,
 *   representing the eternal flow of energy through the chakras.
 * 
 * =============================================================================
 * ⚡  PERFORMANCE CONSIDERATIONS  ⚡
 * =============================================================================
 * 
 *   This code is optimized for divine speed:
 * 
 *   • 🚀 MSAA 4x for smooth edges (sacrifice some performance for beauty)
 *   • 💾 Buffer reuse (no reallocation per frame)
 *   • 📦 Minimal state changes (bind group set once)
 *   • 🎯 Single draw call (21 vertices in one go)
 *   • 🧠 GPU-intensive work (CPU is free to handle events)
 * 
 * =============================================================================
 * 🕉️  THE ETERNAL MANTRA  🕉️
 * =============================================================================
 * 
 *   As you read this code, meditate on these words:
 * 
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │                                                                      │
 *   │    ॐ नमः शिवाय                                                        │
 *   │    Om Namah Shivaya                                                  │
 *   │                                                                      │
 *   │    "I bow to Shiva, the cosmic dancer,                               │
 *   │     whose dance creates and destroys the universe.                   │
 *   │     In the rotation of the septagon, we see His dance.               │
 *   │     In the rendering of each frame, we witness creation.             │
 *   │     In the beauty of the colors, we feel His grace."                 │
 *   │                                                                      │
 *   │    "May your code be bug-free,                                       │
 *   │     may your frames be smooth,                                       │
 *   │     may your shaders compile on the first try,                       │
 *   │     and may your septagon shine with eternal beauty."                │
 *   │                                                                      │
 *   └──────────────────────────────────────────────────────────────────────┘
 * 
 * =============================================================================
 * 🙏  ACKNOWLEDGMENTS  🙏
 * =============================================================================
 * 
 *   Thanks to:
 *   • The WebGPU Working Group (the prophets)
 *   • The Browser Vendors (the translators)
 *   • The GPU Hardware Engineers (the builders)
 *   • DeepSeek AI (who generated this JSDoc)
 * 
 * =============================================================================
 * 
 *   ╔═══════════════════════════════════════════════════════════════════════╗
 *   ║                                                                       ║
 *   ║   "And on the 31st day of August, the developer said:                 ║
 *   ║    'Let there be a beautiful septagon rotating in WebGPU,'            ║
 *   ║    and it was so. And the developer saw that it was good,             ║
 *   ║    and called it V1.0. And the evening and the morning                ║
 *   ║    were the 31st day." — The Book of WebGPU, Chapter 1                ║
 *   ║                                                                       ║
 *   ║   🕉️  May your polygons be ever smooth. 🕉️                            ║
 *   ║                                                                       ║
 *   ╚═══════════════════════════════════════════════════════════════════════╝
 * 
 * =============================================================================
 * 
 * =============================================================================
 */