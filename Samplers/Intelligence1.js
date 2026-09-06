// ।। ॐ नमः शिवाय ।। \\

///// ============================ \\\\\
/// ++ RENDERING IMAGES IN WEBGPU ++ \\\
///// ============================ \\\\\

/// ++ SOURCE OF TRUTH ++ \\\
/**
 * @type {object} wgpu
 * 
 * @property {GPUAdapter} adapter
 * @property {GPUDevice} device
 * @property {GPUTextureFormat} format
 * @property {string} wgsl
 * @property {GPUShaderModule} compiledModule
 * @property {GPUBindGroupLayout} bindGroupLayout
 * @property {GPUPipelineLayout} pipelineLayout
 * @property {GPURenderPipeline} pipeline
 * @property {object<GPUTexture>} textures
 * @property {object<GPUBuffer>} buffers
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

/** @type {HTMLCanvasElement} */
const renderSpace = document.getElementById("render-space");
renderSpace.width = vw;
renderSpace.height = vh;

/** @type {GPUCanvasContext} */
const renderBrush = renderSpace.getContext('webgpu');


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
  renderBrush.configure({
    device: wgpu.device,
    format: wgpu.format
  });
  console.info("Initialization successful! 😇");
}

///// ======================= \\\\\
/// ++ WGSL & COMPILATION ++ \\\
///// ======================= \\\\\

/**
 * @learning ++ WHY NEED UVs AT ALL ??? ++
 * 
 * UV coordinates exist because the GPU has no inherent idea how to stretch a 2D image over geometry.
 * To the GPU: 
 *   - A mesh/quad is defined by 3D or 2D vertex positions (like X, Y, Z).
 *   - An image is just a flat grid of pixels (texels) indexed by width and height (like 0 to 1920 pixels wide).
 *   - UV coordinates are the bridge. They act as a standardized coordinate map that translates vertex locations into texture locations.
 * 
 * Why "U" and "V"?
 *   - We already use X, Y, Z for 3D spatial coordinates in world space. To avoid confusion, graphics engineers chose U (horizontal axis) and V (vertical axis) for 2D texture space.
 *   - U ranges from 0.0 (left edge of image) to 1.0 (right edge).
 *   - V ranges from 0.0 (top edge) to 1.0 (bottom edge).
 *   - No matter how big, small, wide, or tall your image is—whether it's 512 \times 512 or 4000 \times 2000—the UV space is always normalized from 0.0 to 1.0.
 * 
 * ++ The Big Takeaway ++
 *   - Think of UV mapping like pinning paper to a bulletin board:
 *   - Your Screen/Mesh is the bulletin board (pos).
 *   - Your Image is the piece of paper (imgTexture).
 *   - UV coordinates are the pins holding the 4 corners of the paper onto the 4 corners of the board.
 * 
 * @learning ++ Texture & Sampler ++
 * 
 * ++ texture_2d<f32> (The Raw Pixel Grid) ++
 *   - This is a WebGPU opaque handle representing your image data stored in VRAM.  
 *   - It holds the raw pixel colors (texels) of your image (e.g., RGBA float values).  
 *   - <f32> tells WGSL that when color values are read from this texture, they should be returned
 *     as 32-bit floating-point numbers between 0.0 and 1.0.  
 *   - ++ Think of texture_2d as the image itself stored in memory. ++
 * 
 * ++ sampler (The Sampling Rules) ++
 *   - A sampler is a dedicated piece of GPU hardware logic that controls
 *     how pixels are fetched from a texture when the screen coordinates don't map 1:1 to image pixels.  
 *   - Because an image gets stretched, shrunk, or rotated on screen, the GPU needs rules to
 *     determine what color to return. The sampler object contains properties like:  
 *       - Filtering (magFilter, minFilter): Should it blend neighboring pixels smoothly
 *         ('linear') or look pixelated/retro ('nearest')?  
 *       - Address Modes (addressModeU, addressModeV): What happens if UV coordinates
 *         go outside 0.0–1.0? (e.g., repeat like wallpaper or clamp to the edge).  
 *       - ++ Think of sampler as the instructions for how to read the image. ++
 * 
 * ++ textureSample() - the execution ++
 *   - This is an intrinsic WGSL function that combines all three pieces:  
 *     - image_texture: Takes the raw image.  
 *     - image_sampler: Applies your filtering rules (e.g., linear interpolation).  
 *     - input.uv: Reads at the normalized coordinate location (ranging from 0.0 to 1.0).  
 *     - ++ It calculates and returns a final vec4f color for that specific fragment. ++
 */

wgpu.wgsl = `
  @group(0) @binding(0) var image_sampler: sampler;
  @group(0) @binding(1) var image_texture: texture_2d<f32>;
  @group(0) @binding(2) var<uniform> scale: f32;
  
  struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f, 
  }
  
  @vertex
  fn shade_vertex(@builtin(vertex_index) i: u32) -> VertexOutput {
    let coordinates: array<vec2f, 6> = array<vec2f, 6>(
      vec2f(-1.0, 1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), 
      vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, -1.0), 
    );

    let uvs: array<vec2f, 6> = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0),
    );

    var output: VertexOutput;
    output.pos = vec4f(coordinates[i].x * scale, coordinates[i].y * scale, 0.0, 1.0);
    output.uv = uvs[i];
    return output;
  }

  @fragment
  fn shade_fragment(input: VertexOutput) -> @location(0) vec4f {
    return textureSample(image_texture, image_sampler, input.uv);
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

///// ======================== \\\\\
//// ++ PIPELINE & TEXTURES ++ \\\
///// ======================== \\\\\

/**
 * Establishes render pipeline & textures.
 * Also establishes bind group layout & pipeline layout.
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
   * @inbuilt_function createPipelineLayout
   * @belongs_to GPUDevice
   * @param {GPUPipelineLayoutDescriptor} object
   * @return {GPUPipelineLayout} object
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
  
  wgpu.device.pushErrorScope('validation');  
  // << bind group layouts >> \\
  wgpu.bindGroupLayout = wgpu.device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }
    ]
  });
  
  // << pipeline layout >> \\
  wgpu.pipelineLayout = wgpu.device.createPipelineLayout({
    bindGroupLayouts: [wgpu.bindGroupLayout]
  });

  // << pipeline itself >> \\
  wgpu.pipeline = await wgpu.device.createRenderPipelineAsync({
    layout: wgpu.pipelineLayout,
    vertex: { module: wgpu.compiledModule, entryPoint: "shade_vertex" },
    fragment: { module: wgpu.compiledModule, entryPoint: "shade_fragment", targets: [{ format: wgpu.format }] },
    multisample: { count: 4 },
    primitive: { topology: 'triangle-list' }
  });

  // << image >> \\
  const image = new Image();
  image.src = "Shiva.jpg";
  await image.decode(); // ensure image data is fully loaded in JS memory
  const imageBitmap = await createImageBitmap(image);

  // << textures >> \\
  wgpu.textures.msaa = wgpu.device.createTexture({
    size: [renderSpace.width, renderSpace.height],
    sampleCount: 4,
    format: wgpu.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });
  
  wgpu.textures.image = wgpu.device.createTexture({
    size: [imageBitmap.width, imageBitmap.height, 1], // specify depth/array layers (default 1)
    format: 'rgba8unorm', // explicit 8-bit texture format type; imageBitmap can only natively map to this format in VRAM
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });

  // << upload image pixels data to GPU VRAM >> \\
  /**
   * @inbuilt_function copyExternalImageToTexture
   * @belongs_to GPUQueue
   * @param {} object
   * @param {} object
   * @param {} array
   */
  wgpu.device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: wgpu.textures.image },
    [ imageBitmap.width, imageBitmap.height ]
  );

  wgpu.device.popErrorScope().then((error) => {
    if (error) {
      console.warn("WebGPU crash at pipeline & texture setup stage: ", error);
    } else {
      console.log("Pipeline & texture successfully established!! 😎🥳😇");
    }
  });
}

///// ============================== \\\\\
/// ++ SAMPLER, BUFFER & BIND GROUP ++ \\\
///// ============================== \\\\\

/**
 * Creates sampler, buffer & bind group.
 * 
 * @function establishData
 */
function establishData() {
  /**
   * @inbuilt_function createSampler
   * @belongs_to GPUDevice
   * @param {GPUSamplerDescriptor} object
   * @return {GPUSampler} object
   * 
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
   
  /** 
   * @learning ++ WHY NEED SAMPLER ANYWAY ??? ++
   * 
   * A sampler (GPUSampler) is the piece of hardware logic that tells the GPU
   * how to fetch and calculate a color when the screen pixels don't line up 1:1
   * with the image pixels (which is almost 100% of the time).
   * 
   * An image is just a fixed 2D grid of static pixels (texels). When you render
   * that image onto a screen—whether on a tiny 3D mesh, a full-screen quad on a
   * 4K display, or a stretched rectangle—the GPU has to map continuous texture
   * coordinates (UVs from 0.0 to 1.0) back to that raw pixel grid.
   * 
   * ++ Interpolation (Magnification & Minification) ++
   *   - What happens when a 500 × 500 pixel image is rendered across a 2000 × 2000
   *     canvas space? Each image pixel now has to cover 16 canvas pixels.
   *   - The sampler decides how to fill in the gaps:
   *   - magFilter: 'nearest': Picks the single closest raw texel.
   *     This creates a blocky, retro, pixelated look.
   *   - magFilter: 'linear' (Bilinear Filtering): Grabs the 4 surrounding texels
   *     and smoothly blends (interpolates) their colors together based on where the
   *     point falls. This makes zoomed-in images look smooth instead of jagged.
   * 
   * ++ Addressing Modes (What happens outside 0.0 to 1.0?) ++
   *   - What if your shader requests a UV coordinate like 1.5 or -0.2?
   *     The image data ends at 1.0. The sampler defines the boundary behavior:
   *       - addressModeU: 'clamp-to-edge': Stretches the outermost edge pixels infinitely.
   *       - addressModeU: 'repeat': Tiles the image over and over again like wallpaper.
   *       - addressModeU: 'mirror-repeat': Tiles the image, but flips/mirrors it on every repeat step.
   * 
   * ++ Mipmapping (Preventing Aliasing When Zoomed Out) ++
   *   - If a high-resolution 4000 × 4000 image is shrunk down to display on a tiny 50 × 50 icon on screen,
   *     sampling single pixels causes extreme flickering and noise (aliasing) as the object moves.
   *   - The sampler manages mipmaps—pre-calculated, downscaled versions of your texture—and automatically
   *     picks or blends between the correct mip level (mipmapFilter: 'linear') based on how small the image appears on screen.
   * 
   * ++ KEY TAKEAWAY ++ 
   * By decoupling the data (GPUTexture) from the reading instructions (GPUSampler),
   * WebGPU allows you to re-use a single sampler across dozens of different textures
   * (e.g., using one shared linear sampler for your entire game or scene),
   * which saves precious GPU memory state changes.
   */
  wgpu.sampler = wgpu.device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear' // smoothly transitions between high-res and low-res texture levels
  });

  wgpu.buffers.scale = wgpu.device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  wgpu.bindGroup = wgpu.device.createBindGroup({
    layout: wgpu.bindGroupLayout,
    entries: [
      { binding: 0, resource: wgpu.sampler },
      { binding: 1, resource: wgpu.textures.image.createView() },
      { binding: 2, resource: { buffer: wgpu.buffers.scale } }
    ]
  });
}

///// ======================= \\\\\
/// ++ ACTUAL DRAWING ++ \\\
///// ======================= \\\\\

/**
 * Draw actual image.
 * 
 * @function draw
 * @param {number} scale
 */
function draw(scale) {
  /**
   * @inbuilt_function writeBuffer
   * @belongs_to GPUQueue
   * @param {GPUBuffer}
   * @param {number} offset
   * @param {ArrayBuffer} JS data
   * 
   * @inbuilt_function createCommandEncoder
   * @belongs_to GPUDevice
   * @return {GPUCommandEncoder} object
   * 
   * @inbuilt_function beginRenderPass
   * @belongs_to GPUCommandEncoder
   * @param {GPURenderPassDescriptor} object
   * @return {GPURenderPassEncoder} object
   */

  // << write buffer to VRAM >> \\
  wgpu.device.queue.writeBuffer(wgpu.buffers.scale, 0, new Float32Array([scale]));
  
  // << encoder & pass >> \\
  wgpu.encoder = wgpu.device.createCommandEncoder();
  wgpu.pass = wgpu.encoder.beginRenderPass({
    colorAttachments: [{
      view: wgpu.textures.msaa.createView(),
      resolveTarget: renderBrush.getCurrentTexture().createView(),
      clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'discard'
    }]
  });

  // << draw command >> \\
  wgpu.pass.setPipeline(wgpu.pipeline);
  wgpu.pass.setBindGroup(0, wgpu.bindGroup);

  wgpu.pass.draw(6);
  wgpu.pass.end();

  wgpu.device.queue.submit([ wgpu.encoder.finish() ]);

  // console.log("।। ॐ नमः शिवाय ।।");
  // console.log("BOOM SHIVA!!! 😎😎😎🥳🥳😇😇🙏🙏");
}

///// ======================== \\\\\
/// ++ MASTER CLASS ++ \\\
///// ======================== \\\\\

/**
 * @class RenderEngine
 */
class RenderEngine {
  constructor() {
    /// +++!!! CLASS SETUP !!!+++ \\\
    // ++ class data ++ \\
    this.scale = 1.0;
    this.start = {
      zero: { x: 0.0, y: 0.0 },
      one: { x: 0.0, y: 0.0 },
      dist: 0.0
    };
    this.move = {
      zero: { x: 0.0, y: 0.0 },
      one: { x: 0.0, y: 0.0 },
      dist: 0.0
    };
    this.lastTime = performance.now();
    this.frameCount = 0;
    
    // ++ class function calls ++ \\
    this.setupTouchListeners();
    this.setupWheelListener();
    requestAnimationFrame((currentTime) => { this.loop(currentTime); this.logFPS(currentTime); });
  }
  /// +++!!! FUNCTIONS SETUP !!!+++ \\\
  // << master animation loop >> \\
  /**
   * @function loop
   * @param {DOMHighResTimeStamp} currentTime
   */
  loop(currentTime) {
    draw(this.scale);
    requestAnimationFrame((currentTime) => { this.loop(currentTime); });
  }

  // << helper math function >> \\
  /**
   * Takes <x, y> coordinates of 2 points.
   * Returns the euclidean distance between them.
   * 
   * @function getDist
   * @param {object} p0
   * @param {object} p1
   * @return {number} distance
   */
  getDist(p0, p1) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }
  
  // << setup mobile/tablet touch event listeners >> \\
  /**
   * ++ FOR MOBILE/TABLET ++
   * Sets up 2 event listeners on document.
   * One for touchstart.
   * The other for touchmove.
   * Both are used to update scale of rendering.
   * 
   * @function setupTouchListeners
   */
  setupTouchListeners() {
    let baseScale = 1.0;
    
    // << TOUCH START >> \\
    document.addEventListener('touchstart', (e) => {
      // << only process if 2 fingers active >> \\
      if (e.touches.length === 2) {
        this.start.zero = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.start.one  = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        this.start.dist = this.getDist(this.start.zero, this.start.one);
      }

      // << save base state >> \\
      baseScale = this.scale;
    });

    // << TOUCH MOVE/END >> \\
    document.addEventListener('touchmove', (e) => {
      // << process only if 2 fingers active >> \\
      if (e.touches.length === 2) {
        this.move.zero = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.move.one  = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        this.move.dist = this.getDist(this.move.zero, this.move.one);
      }

      // << update scale >> \\
      const ratio = this.move.dist / this.start.dist;
      this.scale = Math.max(0.1, Math.min(10.0, baseScale * ratio)); // clamped between 0.1 to 10.0
    });   
  }
  
  // << setup laptop/desktop mouse wheel scroll listener >> \\
  /**
   * ++ FOR LAPTOP/DESKTOP ++
   * Sets up only one wheel event listener directly to the document.
   * Uses data to update scale of rendering.
   * 
   * @function setupWheelListener
   */
  setupWheelListener() {
    const zoomSensitivity = 0.002;
    document.addEventListener('wheel', (e) => {
      // << prevent browser page from scrolling up/down >> \\
      e.preventDefault();

      // << deltaY is negative when scrolling up & vice-versa >> \\
      // << thus, we invert it >> \\
      const deltaScale = -e.deltaY * zoomSensitivity;

      // << update / clamped between 0.1 & 10.0 >> \\
      this.scale += deltaScale;
      this.scale = Math.max(0.1, Math.min(10.0, this.scale));
    }, { passive: false });
  }

  // << tracks frame rates >> \\
  /**
   * Logs frame rates in FPS via rAF.
   * 
   * @function logFPS
   * @param {DOMHighResTimeStamp} currentTime
   */
  logFPS(currentTime) {
    this.frameCount++;
    const elapsed = currentTime - this.lastTime;
    if (elapsed >= 1000.0) {
      console.log(`Frame rate: ${this.frameCount}fps.`);
      this.frameCount = 0;
      this.lastTime = currentTime - (elapsed % 1000.0);
    }
    requestAnimationFrame((currentTime) => { this.logFPS(currentTime); });
  }
}


///// ======================== \\\\\
/// ++ MASTER EVENT LISTENER ++ \\\
///// ======================== \\\\\

window.addEventListener('load', async () => {
  await INITIALIZE();
  await compileShader();
  await establishPipelineAndTextures();
  establishData();

  wgpu.device.addEventListener('uncapturederror', (e) => {
    console.warn(e.error);
  });

  const render = new RenderEngine();
  console.log(wgpu);
});

///// ++ DEVELOPER'S NOTES ++ \\\\\
/**
 * || Om Tatpurushaya Vidmahe |
 *    Mahadevaya Dhimahi |
 *    Tanno Rudrah Prachodayat ||
 * 
 * @functions_list
 *    - INITIALIZE
 *    - compileShader
 *    - establishPipelineAndTextures
 *    - establishData
 *    - draw
 *
 * @class RenderEngine
 * @class_data
 *    - scale      @type {number}
 *    - start      @type {object}
 *    - move       @type {object}
 *    - lastTime   @type {DOMHighResTimeStamp}
 *    - frameCount @type {number}
 * @class_functions
 *    - loop                @param {DOMHighResTimeStamp}    @return {null}
 *    - getDist             @param {object} @param {object} @return {number}
 *    - setupTouchListeners @param {null}                   @return {null}
 *    - setupWheelListener  @param {null}                   @return {null}
 *    - logFPS              @param {DOMHighResTimeStamp}    @return {null}
 *
 * @acknowledgement
 * Google Gemini AI helped me in learning new concepts & writing the comments explaining them.
 */