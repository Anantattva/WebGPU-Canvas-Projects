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
let vw = window.innerWidth;
/** viewport height */
let vh = window.innerHeight;

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
  @group(0) @binding(3) var<uniform> rotated_angles: vec2f;
  @group(0) @binding(4) var<uniform> proj_matrix: mat4x4f;
  @group(0) @binding(5) var<uniform> base_vertices: array<vec4f, 36>;

  const BASE_UVS: array<vec2f, 6> = array<vec2f, 6>(
    vec2f(1.0, 0.0), vec2f(0.0, 0.0), vec2f(0.0, 1.0),  // Triangle 1
    vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0),  // Triangle 2
  );
  
  struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) frag_uv: vec2f, 
    @location(1) frag_pos: vec4f, 
  }
  
  @vertex
  fn shade_vertex(@builtin(vertex_index) i: u32) -> VertexOutput {
    // << setup >>
    var v = base_vertices[i];
    let sinx: f32 = sin(rotated_angles.x);
    let cosx: f32 = cos(rotated_angles.x);
    
    let siny: f32 = sin(rotated_angles.y);
    let cosy: f32 = cos(rotated_angles.y);

    // << x angle rotation >>
    let y1 = v.y * cosx - v.z * sinx;
    let z1 = v.y * sinx + v.z * cosx;
    v.y = y1;
    v.z = z1;

    // << y angle rotation >>
    let z2 = v.z * cosy - v.x * siny;
    let x2 = v.z * siny + v.x * cosy;
    v.z = z2;
    v.x = x2;

    // << scale >>
    v.x *= scale;
    v.y *= scale;
    v.z -= 5.0; // NEVER FORGET THIS!! I always forget this & wonder why no cube despite zero console errors... 😭😭😭

    var output: VertexOutput;
    output.pos = proj_matrix * v;
    output.frag_uv = BASE_UVS[i % 6];
    output.frag_pos = vec4f(1.0, 1.0, 1.0, 1.0);
    return output;
  }

  @fragment
  fn shade_fragment(input: VertexOutput) -> @location(0) vec4f {
    return textureSample(image_texture, image_sampler, input.frag_uv) * input.frag_pos;
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
   * @inbuilt_function createTexture
   * @belongs_to GPUDevice
   * @param {GPUTextureDescriptor} object
   * @return {GPUTexture} object
   */
    
  // << bind group layouts >> \\
  wgpu.bindGroupLayout = wgpu.device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }
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
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' }
  });

  /**
   * @learning
   * ++ premultipliedAlpha (The Color & Transparency Flag) ++
   *   - What it does: Controls whether the browser multiplies the RGB channels by the Alpha channel
   *     before passing the pixels to you (RGB * Alpha).
   *   - Wrong Flag Impact:
   *       - If you set premultipliedAlpha: 'premultiply' (the default in some contexts) but your
   *         WGSL shader expects straight alpha ('none'), transparent edges will look dark, burnt,
   *         or muddy because alpha was applied twice.
   *       - If set incorrectly when copying to a WebGPU texture format like 'rgba8unorm',
   *         WebGPU might throw a validation error if the texture format and copy settings clash on color expectations.
   * 
   * ++ imageOrientation (The Y-Axis Flip Flag) ++
   *   - What it does: Controls whether the image is flipped vertically when decoded ('none' vs 'flipY').
   *   - Wrong Flag Impact:
   *       - HTML images start (0, 0) at the top-left, whereas traditional 3D graphics UV coordinates start (0, 0) at the bottom-left.
   *       - If set incorrectly, your rendered texture in WebGPU will be upside down.
   * 
   * ++ colorSpaceConversion (The Color Profile Flag) ++
   *   - What it does: Controls whether color profiles (like Display P3 or Adobe RGB) are converted to sRGB ('sRGB' vs 'none').
   *   - Wrong Flag Impact:
   *       - If set to 'none' on a high-gamut image (like an iPhone P3 photo) and rendered directly to a standard sRGB canvas,
   *         your colors will look washed out, dull, or strangely over-saturated.
   */
  // << image >> \\
  const image = new Image();
  image.src = "Shiva.jpg";
  await image.decode(); // ensure image data is fully loaded in JS memory
  // const imageBitmap = await createImageBitmap(image);
  const size = image.width; // The square's dimension matches the image width
  const startX = 0;
  const startY = (image.height - image.width) / 2; // Slices equal parts off top and bottom
  const endX = size;
  const endY = size;

  // << decodes and crops-out square simultaneously off the main thread >> \\
  const imageBitmap = await createImageBitmap(image, startX, startY, endX, endY, {
    colorSpaceConversion: 'default',
    premultipliedAlpha: 'none',
    imageOrientation: 'none'
  });

  // << textures >> \\
  wgpu.textures.msaa = wgpu.device.createTexture({
    size: [renderSpace.width, renderSpace.height, 1],
    sampleCount: 4,
    format: wgpu.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });
  
  wgpu.textures.image = wgpu.device.createTexture({
    size: [imageBitmap.width, imageBitmap.height, 1], // specify depth/array layers (default 1)
    format: 'rgba8unorm', // explicit 8-bit texture format type; imageBitmap can only natively map to this format in VRAM
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });
  
  wgpu.textures.depth = wgpu.device.createTexture({
    size: [renderSpace.width, renderSpace.height, 1], // specify depth/array layers (default 1)
    sampleCount: 4,
    format: 'depth24plus', // explicit 8-bit texture format type; imageBitmap can only natively map to this format in VRAM
    usage: GPUTextureUsage.RENDER_ATTACHMENT
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
  
  console.log("Pipeline & texture successfully established!! 😎🥳😇");
}

///// ============================== \\\\\
/// ++ SAMPLER, BUFFER & BIND GROUP ++ \\\
///// ============================== \\\\\

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
 * Creates the ArrayBuffer for cubes.
 * Passes 36 vertices for rendering.
 * Each square face composes of 2 triangles -> so, 6 vertices per face.
 * Thus, 6 × 6 = 36 vertices per cube.
 * Each vertex: <x, y, z, w>.
 * Thus, 36 × 4 = 144 total array length.
 * So, 144 × 4 = 576 bytes array size.
 *
 * @function create3DCube
 * @return {ArrayBuffer} Float32Array
 */
function create3DCube() {
  // Define 8 unique corners
  const v0 = [ 1.0,  1.0,  1.0, 1.0]; // Front-top-right
  const v1 = [-1.0,  1.0,  1.0, 1.0]; // Front-top-left
  const v2 = [-1.0, -1.0,  1.0, 1.0]; // Front-bottom-left
  const v3 = [ 1.0, -1.0,  1.0, 1.0]; // Front-bottom-right
  const v4 = [ 1.0,  1.0, -1.0, 1.0]; // Back-top-right
  const v5 = [-1.0,  1.0, -1.0, 1.0]; // Back-top-left
  const v6 = [-1.0, -1.0, -1.0, 1.0]; // Back-bottom-left
  const v7 = [ 1.0, -1.0, -1.0, 1.0]; // Back-bottom-right
        
  return new Float32Array([
    // Front face (+Z)
    ...v0, ...v1, ...v2,   ...v0, ...v2, ...v3,
    // Back face (-Z)
    ...v4, ...v7, ...v6,   ...v4, ...v6, ...v5,
    // Top face (+Y)
    ...v4, ...v5, ...v1,   ...v4, ...v1, ...v0,
    // Bottom face (-Y)
    ...v3, ...v2, ...v6,   ...v3, ...v6, ...v7,
    // Right face (+X)
    ...v4, ...v0, ...v3,   ...v4, ...v3, ...v7,
    // Left face (-X)
    ...v1, ...v5, ...v6,   ...v1, ...v6, ...v2,
  ]);
}

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

  // << buffers & data >> \\
  const projMatrix = createProjectionMatrix(Math.PI / 3.0, vw / vh, 0.1, 100.0);
  const baseVertices = create3DCube();

  wgpu.buffers.scale = wgpu.device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  wgpu.buffers.rotatedAngles = wgpu.device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  
  wgpu.buffers.projMatrix = wgpu.device.createBuffer({
    size: projMatrix.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  wgpu.device.queue.writeBuffer(wgpu.buffers.projMatrix, 0, projMatrix);
  
  wgpu.buffers.baseVertices = wgpu.device.createBuffer({
    size: baseVertices.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  wgpu.device.queue.writeBuffer(wgpu.buffers.baseVertices, 0, baseVertices);

  wgpu.bindGroup = wgpu.device.createBindGroup({
    layout: wgpu.bindGroupLayout,
    entries: [
      { binding: 0, resource: wgpu.sampler },
      { binding: 1, resource: wgpu.textures.image.createView() },
      { binding: 2, resource: { buffer: wgpu.buffers.scale } },
      { binding: 3, resource: { buffer: wgpu.buffers.rotatedAngles } },
      { binding: 4, resource: { buffer: wgpu.buffers.projMatrix } },
      { binding: 5, resource: { buffer: wgpu.buffers.baseVertices } }
    ]
  });
}

///// ======================= \\\\\
/// ++ ACTUAL DRAWING ++ \\\
///// ======================= \\\\\

/**
 * Draw actual image.
 * Takes scale & rotated angles as input.
 * 
 * @function draw
 * @param {number} scale
 * @param {number} rx
 * @param {number} ry
 */
function draw(scale, rx, ry) {
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
  wgpu.device.queue.writeBuffer(wgpu.buffers.rotatedAngles, 0, new Float32Array([rx, ry]));
  
  // << encoder & pass >> \\
  wgpu.encoder = wgpu.device.createCommandEncoder();
  wgpu.pass = wgpu.encoder.beginRenderPass({
    colorAttachments: [{
      view: wgpu.textures.msaa.createView(),
      resolveTarget: renderBrush.getCurrentTexture().createView(),
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

  // << draw command >> \\
  wgpu.pass.setPipeline(wgpu.pipeline);
  wgpu.pass.setBindGroup(0, wgpu.bindGroup);

  wgpu.pass.draw(36);
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
    this.rotate = {
      angleX: 0.0,
      angleY: 0.0
    };
    this.lastTime = performance.now();
    this.frameCount = 0;
    
    // ++ class function calls ++ \\
    this.setupWheelListener();
    this.setupRotateListeners();
    this.setupResizeListener();
    requestAnimationFrame((currentTime) => { this.loop(currentTime); this.logFPS(currentTime); });
  }
  /// +++!!! FUNCTIONS SETUP !!!+++ \\\
  // << master animation loop >> \\
  /**
   * @function loop
   * @param {DOMHighResTimeStamp} currentTime
   */
  loop(currentTime) {
    draw(this.scale, this.rotate.angleX, this.rotate.angleY);
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
      if (typeof deltaScale === 'number') {
        this.scale += deltaScale;
        this.scale = Math.max(0.1, Math.min(10.0, this.scale));
      }
    }, { passive: false });
  }

  // << setup rotation listeners >> \\
  setupRotateListeners() {
    const activePointers = new Map();
    let previousSinglePointer = { x: 0, y: 0 };
    let initialPinchDist = 0;
    let baseScale = 1.0;

    const rotateSensitivity = 0.005;

    // Use renderSpace (the canvas) instead of document to scope interactions cleanly
    renderSpace.addEventListener('pointerdown', (e) => {
      renderSpace.setPointerCapture(e.pointerId); // Captures pointer even if it leaves canvas
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 1) {
        previousSinglePointer = { x: e.clientX, y: e.clientY };
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        initialPinchDist = this.getDist(pts[0], pts[1]);
        baseScale = this.scale;
      }
    });

    renderSpace.addEventListener('pointermove', (e) => {
      if (!activePointers.has(e.pointerId)) return;
    
      // Update active pointer position
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // 1-Finger / Mouse Drag -> Rotate
      if (activePointers.size === 1) {
        const dx = e.clientX - previousSinglePointer.x;
        const dy = e.clientY - previousSinglePointer.y;

        this.rotate.angleX += dy * rotateSensitivity;
        this.rotate.angleY += dx * rotateSensitivity;

        previousSinglePointer = { x: e.clientX, y: e.clientY };
      } 
      // 2-Finger Pinch -> Zoom
      else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const currentDist = this.getDist(pts[0], pts[1]);

        if (initialPinchDist > 0) {
          const ratio = currentDist / initialPinchDist;
          this.scale = Math.max(0.1, Math.min(10.0, baseScale * ratio));
        }
      }
    });

    const handlePointerEnd = (e) => {
      activePointers.delete(e.pointerId);
      if (renderSpace.hasPointerCapture(e.pointerId)) {
        renderSpace.releasePointerCapture(e.pointerId);
      }
    };

    renderSpace.addEventListener('pointerup', handlePointerEnd);
    renderSpace.addEventListener('pointercancel', handlePointerEnd); // Clean release if OS interrupts gesture
  }

  // << re-configures necessary data on screen resize >> \\
  setupResizeListener() {
    // << updates viewport dimensions & canvas resolution >> \\
    const updateDimensions = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      renderSpace.width = vw;
      renderSpace.height = vh;
    };

    // << destroys ONLY necessary old textures & creates new one >> \
    const updateTextures = () => {
      wgpu.textures.msaa.destroy();
      wgpu.textures.depth.destroy();

      wgpu.textures.msaa = wgpu.device.createTexture({
        size: [renderSpace.width, renderSpace.height],
        sampleCount: 4,
        format: wgpu.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      
      wgpu.textures.depth = wgpu.device.createTexture({
        size: [renderSpace.width, renderSpace.height],
        sampleCount: 4,
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
    }

    // << writes new buffers to VRAM >> \\
    const updateBuffers = () => {
      const newProjMatrix = createProjectionMatrix(Math.PI / 3.0, vw / vh, 0.1, 100.0);

      wgpu.device.queue.writeBuffer(wgpu.buffers.projMatrix, 0, newProjMatrix);
    };

    // << initializes listener >> \\
    window.addEventListener('resize', () => {
      updateDimensions();
      updateTextures();
      updateBuffers();
    });
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
  try {
    await INITIALIZE();
    await compileShader();
    await establishPipelineAndTextures();
    establishData();

    wgpu.device.addEventListener('uncapturederror', (e) => {
      console.warn(e.error);
    });

    const render = new RenderEngine();
    console.log(wgpu);
  } catch (error) {
    console.warn("Initialization failed: ", error);
  }
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
 *    - createProjectionMatrix
 *    - create3DCube
 *    - establishData
 *    - draw
 *
 * @class RenderEngine
 * @class_data
 *    - scale      @type {number}
 *    - start      @type {object}
 *    - move       @type {object}
 *    - rotate     @type {object}
 *    - lastTime   @type {DOMHighResTimeStamp}
 *    - frameCount @type {number}
 * @class_functions
 *    - loop                  @param {DOMHighResTimeStamp}    @return {null}
 *    - getDist               @param {object} @param {object} @return {number}
 *    - setupWheelListener    @param {null}                   @return {null}
 *    - setupRotateListeners  @param {null}                   @return {null}
 *    - setupResizeListener   @param {null}                   @return {null}
 *    - logFPS                @param {DOMHighResTimeStamp}    @return {null}
 *
 * @acknowledgement
 * Google Gemini AI helped me in learning new concepts & writing the comments explaining them.
 * Also debugging the glitchy rotate event listeners.
 */