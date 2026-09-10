// ।। ॐ नमः शिवाय ।। \\

// @date
// START 10th September, 2026
// END

// @learning
// This projects aims to learn how images are processed via WebGPU

///// ========================= \\\\\
/// ++ IMAGE PROCESSING ++ \\\
///// ========================= \\\\\

/// ++ SOURCE OF TRUTH ++ \\\
/**
 * @type {object} wgpu
 * 
 * @property {GPUAdapter} adapter
 * @property {GPUDevice} device
 * @property {GPUTextureFormat} format
 * @property {String} wgsl
 * @property {GPUShaderModule} compiledModule
 * @property {GPUBindGroupLayout} bindGroupLayout
 * @property {GPUPipelineLayout} pipelineLayout
 * @property {GPURenderPipeline} pipeline
 * @property {Object<GPUTexture>} textures
 * @property {Object<GPUBuffer>} buffers
 * @property {GPUBindGroup} bindGroup
 * @property {GPUCommandEncoder} encoder
 * @property {GPURenderPassEncoder} pass
 */
const wgpu = {
  adapter: null,
  device: null,
  format: null,
  wgsl: null,
  compiledModule: null,
  bindGroupLayout: null,
  pipelineLayout: null,
  pipeline: null,
  textures: {},
  buffers: {},
  bindGroup: null,
  sampler: null,
  encoder: null,
  pass: null
};

/** viewport width */
const vw = window.innerWidth;
/** viewport height */
const vh = window.innerHeight;

///// ++ CANVAS SETUP ++ \\\\\
/** @type {HTMLCanvasElement} */
const screen = document.getElementById("screen");
screen.width = 0.8 * vw; 
screen.height = 0.8 * vh;

/** @type {GPUCanvasContext} */
const brush = screen.getContext('webgpu');

/** @type {HTMLDivElement} */
const inputBar = document.getElementById("input-bar");
/** @type {HTMLDivElement} */
const inputCursor = document.getElementById("input-cursor");


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
  if (!navigator.gpu) {
    throw new Error("WebGPU not available");
  }
  try {
    /**
     * @async
     * @inbuilt_function requestAdapter
     * @belongs_to GPU
     * @return {Promise<GPUAdapter>} object
     */
    
    wgpu.adapter = await navigator.gpu.requestAdapter();
  } catch (error) {
    throw new Error("No suitable adapter found.", error);
  }
  try {
    /**
     * @async
     * @inbuilt_function requestDevice
     * @belongs_to GPUAdapter
     * @return {Promise<GPUDevice>} object
     */
    
    wgpu.device = await wgpu.adapter.requestDevice();
  } catch (error) {
    throw new Error("No suitable device found.", error);
  }

  /**
   * @inbuilt_function getPreferredCanvasFormat
   * @belongs_to GPU
   * @return {GPUTextureFormat} object
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

///// ======================== \\\\\
/// ++ WGSL & COMPILATION ++ \\\
///// ======================== \\\\\

wgpu.wgsl = `
  @group(0) @binding(0) var input_sampler: sampler;
  @group(0) @binding(1) var input_image: texture_2d<f32>;
  
  @group(0) @binding(2) var<uniform> overlay_colour: vec4f;

  struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(1) frag_uv: vec2f,
  }

  const BASE_POS: array<vec2f, 6> = array<vec2f, 6>(
    // ++ top-left -- top-right -- bottom-left triangle ++
    vec2f(-1.0, 1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0),

    // ++ top-right -- bottom-left -- bottom-right triangle ++ 
    vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, -1.0)
  );

  const BASE_UVS: array<vec2f, 6> = array<vec2f, 6>(
  // ++ top-left -- top-right -- bottom-left ++
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),  // Triangle 1

    // ++ top-right -- bottom-left -- bottom-right ++
    vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0),  // Triangle 2
  );

  fn hsla_to_rgba(hsla: vec4f) -> vec4f {
    let h: f32 = hsla.x;
    let s: f32 = hsla.y / 100.0;
    let l: f32 = hsla.z / 100.0;
    let a: f32 = hsla.w;
            
    let a_factor = s * min(l, 1.0 - l);
    let n: vec3f = vec3f(0.0, 8.0, 4.0);
            
    let structural_k: vec3f = n + vec3f(h / 30.0);
    let k: vec3f = structural_k - 12.0 * floor(structural_k / 12.0);
            
    let min_value: vec3f = min(k - vec3f(3.0), vec3f(9.0) - k);
    let clamp_value: vec3f = max(vec3f(-1.0), min(min_value, vec3f(1.0)));
            
    let rgb: vec3f = vec3f(l) - vec3f(a_factor) * clamp_value;
    return vec4f(rgb, a);
  }
          
  @vertex
  fn vs_main(@builtin(vertex_index) index: u32) -> VertexOutput {    
    var output: VertexOutput;
    output.pos = vec4f(BASE_POS[index], 0.0, 1.0);
    output.frag_uv = BASE_UVS[index];

    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4f {
    let texture_colour = textureSample(input_image, input_sampler, input.frag_uv);
    return mix(hsla_to_rgba(overlay_colour), texture_colour, 0.8);
  }
`;


/**
 * Compiles WGSL & logs output.
 * 
 * @async
 * @function compileShader
 */
async function compileShader() {
  if (!wgpu.wgsl) {
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
  wgpu.compiledModule = wgpu.device.createShaderModule({ code: wgpu.wgsl });
  const info = await wgpu.compiledModule.getCompilationInfo();
  info.messages.forEach((m) => {
    if (m.type === 'error') {
      console.warn(m);
    }
  });
  if (info.messages.every((m) => m.type !== 'error')) {
    console.info("WGSL compilation successful! 😇");
  }      
}

/**
 * Establishes layouts for bind group & pipeline.
 * 
 * @function awakeLayouts
 */
function awakeLayouts() {
  // << awake bind group layout >> \\
  wgpu.bindGroupLayout = wgpu.device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
    ]
  });

  // << awake pipeline layout >> \\
  wgpu.pipelineLayout = wgpu.device.createPipelineLayout({
    bindGroupLayouts: [wgpu.bindGroupLayout]
  });

  console.log("Layouts awakened!! 😇😇😎");
}

/**
 * Establishes render pipeline.
 * 
 * @async
 * @function awakePipeline
 */
async function awakePipeline() {
  // << awake pipeline >> \\
  wgpu.pipeline = await wgpu.device.createRenderPipelineAsync({
    layout: wgpu.pipelineLayout,
    vertex: { module: wgpu.compiledModule, entryPoint: "vs_main" },
    fragment: { module: wgpu.compiledModule, entryPoint: "fs_main", targets: [{ format: wgpu.format }] },
    multisample: { count: 4 },
    primitive: { topology: 'triangle-list' }
  });

  console.log("Pipeline awakened!! 😇😇😎");
}

/**
 * Establishes image textures.
 * Also loads image & decodes its data.
 * 
 * @async
 * @function awakeTextures
 */
async function awakeTextures() {
  // << MSAA texture >> \\
  wgpu.textures.msaa = wgpu.device.createTexture({
    size: [screen.width, screen.height],
    sampleCount: 4,
    format: wgpu.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });

  // << image & image texture >> \\
  const targetImage = new Image();
  targetImage.src = "TargetImage.jpg";
  await targetImage.decode();
  const imageBitmap = await createImageBitmap(targetImage);
  
  wgpu.textures.image = wgpu.device.createTexture({
    size: [imageBitmap.width, imageBitmap.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });

  // << upload to VRAM >> \\
  /**
   * @inbuilt_function copyExternalImageToTexture
   * @belongs_to GPUQueue
   * @param {GPUCopyExternalImageSourceInfo} object, An object defining the image source and optional properties like origin or flipping
   * @param {GPUCopyExternalImageDestInfo} object, An object defining the destination texture, mip level, origin, and color space metadata
   * @param {GPUExtent3D} array, An array (or object) specifying the dimensions ([width, height, depth]) of the region being copied
   */
  wgpu.device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: wgpu.textures.image },
    [imageBitmap.width, imageBitmap.height]                                            
  );

  console.log("Image & textures ready!! 😇😇😎");
}

/**
 * Establishes sampler.
 * 
 * @function awakeSampler
 */
function awakeSampler() {
  // << sampler >> \\
  wgpu.sampler = wgpu.device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
    mipmapFilter: 'linear'
  });

  console.log("Sampler awakened!! 😇😇😎");
}

/**
 * Establishes buffers for VRAM allocation.
 * 
 * @function awakeBuffers
 */
function awakeBuffers() {
  // << hue buffer >> \\
  wgpu.buffers.hue = wgpu.device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  console.log("Buffers ready!! 😇😇😎");
}

/**
 * Establishes bind group.
 * 
 * @function awakeBindGroup
 */
function awakeBindGroup() {
  wgpu.bindGroup = wgpu.device.createBindGroup({
    layout: wgpu.bindGroupLayout,
    entries: [
      { binding: 0, resource: wgpu.sampler },
      { binding: 1, resource: wgpu.textures.image.createView() },      
      { binding: 2, resource: { buffer: wgpu.buffers.hue } }
    ]
  });

  console.log("Bind group ready!! 😎😎😇");
}

///// ====================== \\\\\
/// ++ ACTUAL PROCESSING ++ \\\
///// ====================== \\\\\

/**
 * Takes a hue value as input.
 * Then processes & updates the image.
 * 
 * @function editImage
 * @param {number} hueValue
 */
function editImage(hueValue = 180.0) {
  /** @type {DOMHighResTimeStamp}*/
  const start = performance.now();
  
  // << write to VRAM >> \\
  wgpu.device.queue.writeBuffer(wgpu.buffers.hue, 0, new Float32Array([hueValue, 100.0, 50.0, 0.75]));

  // << encoder & pass >> \\
  wgpu.encoder = wgpu.device.createCommandEncoder();
  wgpu.pass = wgpu.encoder.beginRenderPass({
    colorAttachments: [{
      view: wgpu.textures.msaa.createView(),
      resolveTarget: brush.getCurrentTexture().createView(),
      clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'discard'
    }]
  });

  // << draw call & submit >> \\
  wgpu.pass.setPipeline(wgpu.pipeline);
  wgpu.pass.setBindGroup(0, wgpu.bindGroup);
  wgpu.pass.draw(6);
  wgpu.pass.end();

  wgpu.device.queue.submit([ wgpu.encoder.finish() ]);

  /** @type {DOMHighResTimeStamp} */
  const end = performance.now();
  console.log("IMAGE PROCESSED SUCCESSFULLY!! 😎😎😇😇");
  console.log(`Time taken: ${end - start}ms.`); // about 0.5ms; BEAST PERFORMANCE!! 💀💀💀😎🥳
}

///// ====================== \\\\\
/// ++ MASTER RENDER ENGINE ++ \\\
///// ====================== \\\\\

/**
 * @class MasterEngine
 */
class MasterEngine {
  constructor() {
    // !! class setup !! \\
    this.hueValue = 180;
    this.THE_GREAT_AWAKENING();
    this.setupMoveListeners();
  }
  async THE_GREAT_AWAKENING() {
    /** @type {DOMHighResTimeStamp} */
    const start = performance.now();
    
    await INITIALIZE();
    await compileShader();
    awakeLayouts();
    await awakePipeline();
    await awakeTextures();
    awakeSampler();
    awakeBuffers();
    awakeBindGroup();

    /** @type {DOMHighResTimeStamp} */
    const end = performance.now();
    console.log(`Time for complete initialization: ${end - start}ms.`); // about 150ms
    editImage();

    wgpu.device.addEventListener('uncapturederror', (e) => {
      console.warn("WebGPU crash at: ", e.error);
    });
    console.log(wgpu);
  }
  setupMoveListeners() {
    // << setup >> \\
    const rect = inputBar.getBoundingClientRect();
    let isDragging = false;

    // << start >> \\
    inputCursor.addEventListener('pointerdown', (e) => {
      isDragging = true;
    });

    // << move >> \\
    inputCursor.addEventListener('pointermove', (e) => {
      // << setup >> \\
      if (!isDragging) { return; }
      e.preventDefault();

      // << get relative distance ratio & values >> \\
      const ratio = (e.clientX - rect.left) / rect.width;
      const moveValue = Math.max(0.0, Math.min(100.0, ratio * 100.0));
      this.hueValue = Math.round(ratio * 360.0);

      // << update >> \\
      inputCursor.style.left = `${moveValue}%`;
      editImage(this.hueValue);
    }, { passive: false });

    // << end >> \\
    inputCursor.addEventListener('pointerup', () => {
      isDragging = false;
    });
  }
}

window.addEventListener('load', () => {
  const engine = new MasterEngine();
});

/// ++ PROGRAMMER'S INSIGHTS ++ \\\
/**
 * @functions_list
 *    - INITIALIZE
 *    - compileShader
 *    - awakeLayouts
 *    - awakePipeline
 *    - awakeTextures
 *    - awakeSampler
 *    - awakeBuffers
 *    - awakeBindGroup
 *    - editImage
 *
 * @class MasterEngine
 * @class_functions
 *    - THE_GREAT_AWAKENING   @param {null}  @return {null}
 *    - setupMoveListeners    @param {null}  @return {null}
 *
 * 
 * 🎨 ========================================================== 🎨
 *       BRANCHLESS HSL-TO-RGB MATHEMATICAL CONVERSION ENGINE
 * 🎨 ========================================================== 🎨
 * 
 * Instead of using slow `if/else` branches (which slow down GPUs 
 * due to thread divergence), this algorithm maps the color wheel 
 * into a continuous mathematical wave!
 * 
 * THE 4-STEP PIPELINE:
 * ---------------------
 * 1️⃣ CHROMA / AMPLITUDE FACTOR (`a_factor`):
 *    Calculates color vividness based on saturation & lightness.
 *    If lightness is near black or white, it dampens the intensity.
 * 
 * 2️⃣ PHASE SHIFTING & MODULAR WRAPPING (`k`):
 *    Splits the 360° color wheel into 12 structural slices (30° each).
 *    
 *           30° Slices (The 12-Step Color Ring)
 *                     [ 0° ]  -> Red
 *                 11 /      \ 1
 *              10  |   🎨   | 2
 *               9  \        / 3
 *                     [180°]  -> Cyan
 * 
 * 3️⃣ TRIANGLE WAVE GENERATION (`clamp_value`):
 *    Creates continuous up-and-down slopes using min/max bounds.
 *    This replaces conditional logic with pure wave oscillations.
 * 
 *              /\          /\          /\
 *             /  \        /  \        /  \  <-- Triangle Wave 
 *    ________/    \______/    \______/    \_   (R, G, B Offsets)
 * 
 * 4️⃣ FINAL MIX (`rgb`):
 *    Offsets the base lightness by the wave amplitude to output 
 *    smooth Red, Green, and Blue channels simultaneously.
 * 
 */