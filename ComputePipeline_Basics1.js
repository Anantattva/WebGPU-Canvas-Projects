// ।। ॐ नमः शिवाय ।। \\

// !! setup !! \\
const wgpu = {
  adapter: null,
  device: null,
  code: null,
  module: null,
  gpuBuffer: null,
  layout: null,
  bindGroupLayout: null,
  bindGroup: null,
  pipeline: null,
  encoder: null,
  pass: null
};

async function __initialize__() {
  /** @type {GPUAdapter} */
  wgpu.adapter = await navigator.gpu.requestAdapter();
  /** @type {GPUDevice} */
  wgpu.device = await wgpu.adapter.requestDevice();
}

function setShaderAndCompile() {
  if (wgpu.code && wgpu.module) return; // reuse cache;
  wgpu.code = `
    @group(0) @binding(0) var<storage, read_write> data: array<f32>;
  
    // in-built attributes \\
    @compute @workgroup_size(64) // creates 64 working threads;
    fn square_main(@builtin(global_invocation_id) id: vec3<u32>) {
      let index = id.x;
      // << bounds check >> \\
      if (index < arrayLength(&data)) {
        data[index] *= data[index]; // data is a variable we define in our bind group;
      }
    }
  `;
  /** @type {GPUShaderModule} */
  wgpu.module = wgpu.device.createShaderModule({ code: wgpu.code });
}

function setBufferAndBindGroup(inputArray) {
  wgpu.gpuBuffer = wgpu.device.createBuffer({
    size: inputArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(wgpu.gpuBuffer.getMappedRange()).set(inputArray);
  wgpu.gpuBuffer.unmap();
  
  wgpu.bindGroupLayout = wgpu.device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'storage'
      }
    }]
  });
}

function setPipeline() {
  if (wgpu.pipeline) return;
  wgpu.layout = wgpu.device.createPipelineLayout({ bindGroupLayouts: [wgpu.bindGroupLayout] });
  wgpu.pipeline = wgpu.device.createComputePipeline({
    layout: wgpu.layout,
    compute: {
      module: wgpu.module,
      entryPoint: 'square_main'
    }
  });
  wgpu.bindGroup = wgpu.device.createBindGroup({
    layout: wgpu.bindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: wgpu.gpuBuffer
      }
    }]
  });
}

function encodeAndPass(max) {
  wgpu.encoder = wgpu.device.createCommandEncoder();
  wgpu.pass = wgpu.encoder.beginComputePass();
  wgpu.pass.setPipeline(wgpu.pipeline);
  wgpu.pass.setBindGroup(0, wgpu.bindGroup);
  wgpu.pass.dispatchWorkgroups(Math.ceil(max / 64));
  wgpu.pass.end();
  wgpu.device.queue.submit([ wgpu.encoder.finish() ]);
}

async function computeSquares(max) {
  await __initialize__();
  const start = performance.now();
  setShaderAndCompile();
  // console.log("A");
  const inputData = new Float32Array(Array.from({ length: max }, (_, i) => i+1));
  // console.log("B");
  setBufferAndBindGroup(inputData);
  // console.log("C");
  setPipeline();
  // console.log("D");
  encodeAndPass(max);
  // console.log("E");
  const end = performance.now();
  console.log(`WebGPU time for squaring ${max} integers: ${end - start}ms.`);
}
computeSquares(100);
computeSquares(1000);
computeSquares(10000);
computeSquares(100000);
computeSquares(1000000);
computeSquares(10000000);

function squares(max) {
  const start = performance.now();
  const inputData = new Float32Array(Array.from({ length: max }, (_, i) => i+1));
  for (let k=0; k<max; k++) {
    inputData[k] *= inputData[k];
  }
  const end = performance.now();
  console.log(`CPU time for squaring ${max} integers: ${end - start}ms.`);
}

squares(100);
squares(1000);
squares(10000);
squares(100000);
squares(1000000);
squares(10000000);