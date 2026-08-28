// ।। ॐ नमः शिवाय ।। \\

/**
 * @date
 * START 28th August, 2026
 * END 28th August, 2026
 * 
 * @learning
 * This projects is an attempt intuit how gradients interpolation with multiple colours work.
 * 
 * @technique
 * Uses standard bilinear interpolation.
 * RESULT: success, works as expected
 */

///// =================== \\\\\
/// ++ SETUP ++ \\\
///// =================== \\\\\

/** viewport width */
const vw = window.innerWidth;
/** viewport width */
const vh = window.innerHeight;

/** @constants custom width & height */
const WIDTH = 100;
const HEIGHT = 100;
const TOTAL_AREA = WIDTH * HEIGHT;

/** @type {HTMLCanvasElement} */
const screen = document.getElementById("screen-bilinear");
screen.width = WIDTH;
screen.height = HEIGHT;

/** @type {CanvasRenderingContext2D} */
const brush = screen.getContext('2d');

///// ======================= \\\\\
/// ++ COORDINATES & COLOURS ++ \\\
///// ======================= \\\\\

/**
 * @blueprint coordinates
 *     {
 *       x: <u32>
 *       y: <u32>
 *     }
 * @type {object}
 * @property {number} x
 * @property {number} y
 */
const v0 = {x:     0, y:      0};  // top-left     // A vertex
const v1 = {x: WIDTH, y:      0};  // top-right    // B vertex
const v2 = {x:     0, y: HEIGHT};  // bottom-left  // C vertex
const v3 = {x: WIDTH, y: HEIGHT};  // bottom-right // D vertex

/**
 * @blueprint colour
 *     {
 *       r: <f32>
 *       g: <f32>
 *       b: <f32>
 *       a: <f32>
 *     }
 * All values clamped between 0.0 to 1.0.
 * 
 * @type {object}
 * @property {number} r
 * @property {number} g
 * @property {number} b
 * @property {number} a
 */
const c0 = {r: 1.0, g: 0.0, b: 0.0, a: 1.0};  // red at top-left        // A vertex
const c1 = {r: 0.0, g: 1.0, b: 0.0, a: 1.0};  // green at top-right     // B vertex
const c2 = {r: 1.0, g: 0.0, b: 1.0, a: 1.0};  // blue at bottom-left    // C vertex
const c3 = {r: 1.0, g: 1.0, b: 0.0, a: 1.0};  // yellow at bottom-right // D vertex

///// ======================= \\\\\
/// ++ HELPER FUNCTIONS ++ \\\
///// ======================= \\\\\

/**
 * @function getDistance
 * @param {object<number, 2>} p0, point with (x, y) coordinates
 * @param {object<number, 2>} p1, point with (x, y) coordinates
 * @return {number} distance, using euclidean coordinate distance formula
 *
 * @learning
 * @formula
 * Dist(p0, p1) = sqrt(delta_x^2 + delta_y^2);
 */
function getDistance(p0, p1) {
  return Math.sqrt((p1.x - p0.x)*(p1.x - p0.x) + (p1.y - p0.y)*(p1.y - p0.y));
}

/**
 * Takes the 3 vertex coordinates of a triangle.
 * Calculates & returns its area.
 * 
 * @function getAreaByCoords
 * @param {object<number, 2>} v0, first vertex
 * @param {object<number, 2>} v1, second vertex
 * @param {object<number, 2>} v2, third vertex
 *
 * @learning
 * @formula
 * Area(v0, v1, v2)
 *              |    1,    1,    1 |
 *  = 1/2 × Det | v0.x, v1.x, v2.x |
 *              | v0.y, v1.y, v2.y |
 */
function getAreaByCoords(v0, v1, v2) {
  return 0.5 * (v0.x * (v1.y - v2.y) + v1.x * (v2.y - v0.y) + v2.x * (v0.y - v1.y));
}

/**
 * Calculates & returns bilinear coordinates of a point locates within the canvas square.
 * Used later as interpolation weights.
 *
 * @blueprint bilinear coordinates
 *     {
 *       w0: <f32>
 *       w1: <f32>
 *       w2: <f32>
 *       w3: <f32>
 *     }
 * All values clamped between 0.0 to 1.0 and strictly add upto 1.0.
 * 
 * @function getBilinearCoords
 * @param {object<number, 2>} point
 * @return {object<number, 4>} bilinear coordinates/weights
 *
 * @optimization
 * I have used expicit assignment & multiplication.
 * And avoided loops to maximize predictability
 * and enable V8's hidden classes, inline-caching & TurboFan optimizations.
 */
function getBilinearCoords(p) {
  // << normalize >> \\
  const u = p.x / WIDTH;
  const v = p.y / HEIGHT;
  // << weights >> \\
  return {
    w0: (1 - u) * (1 - v),
    w1: u * (1 - v),
    w2: (1 - u) * v,
    w3: u * v
  }
}

/**
 * Takes bilinear weights as inputs.
 * Calcuates & returns interpolated colour.
 *
 * @function getInterpolatedColour
 * @param {object<number, 4>} weights, bilinear coordinates/weights
 * @return {object<number, 4>} interpolated colour
 *
 * @optimization
 * I have used expicit assignment & multiplication.
 * And avoided loops to maximize predictability
 * and enable V8's hidden classes, inline-caching & TurboFan optimizations.
 */
function getInterpolatedColour(weights) {
  return {
    r: (weights.w0 * c0.r) + (weights.w1 * c1.r) + (weights.w2 * c2.r) + (weights.w3 * c3.r),
    g: (weights.w0 * c0.g) + (weights.w1 * c1.g) + (weights.w2 * c2.g) + (weights.w3 * c3.g),
    b: (weights.w0 * c0.b) + (weights.w1 * c1.b) + (weights.w2 * c2.b) + (weights.w3 * c3.b),
    a: 1.0
  }
}

/**
 * Computes linear colour interpolation across canvas screen.
 * Uses bilinear coordinates.
 * Then paints the canvas via a loop.
 *
 * @function paintScreen
 *
 * @pathflow
 * The function starts with timestamps to log performance.
 * Then it clears entire canvas.
 * Next, it constructs 2 nested loops & calls necessary functions.
 * Finally, it paints canvas and logs out time taken for execution.
 */
let timeRecords = [];
function paintScreen() {
  // << setup >> \\
  /** @type {DOMHighResTimeStamp} */
  const start = performance.now();
  brush.clearRect(0, 0, WIDTH, HEIGHT);
  for (let x=0; x<WIDTH; x++) {
    for (let y=0; y<HEIGHT; y++) {
      // << interpolation math >> \\
      const rawColour = getInterpolatedColour(getBilinearCoords({x: x, y: y}));
      // << paint >> \\
      brush.fillStyle = `rgba(${rawColour.r * 100}%, ${rawColour.g * 100}%, ${rawColour.b * 100}%, 1.0)`;
      brush.fillRect(x, y, 1, 1);
    }
  }
  /** @type {DOMHighResTimeStamp} */
  const end = performance.now();
  timeRecords.push(end - start);
  // console.log(`Time for one paint cycle: ${end - start}ms.`);
}

///// ===================== \\\\\
/// ++ MASTER EVENT LISTENER ++ \\\
///// ===================== \\\\\
window.addEventListener('load', () => {
  /** @type {DOMHighResTimeStamp} */
  let baseTime = performance.now();
  let frameCount = 0;
  /**
   * Orchestrates render loop by recursively calling paint function.
   * Uses requestAnimationFrame.
   *
   * @function renderLoop
   */
  function renderLoop(currentTime) {
    const elapsed = currentTime - baseTime;
    frameCount++;
    paintScreen();
    if (elapsed >= 1000.0) {
      console.log("Frame rate: ", frameCount, timeRecords);
      timeRecords = [];
      frameCount = 0;
      baseTime = currentTime - (elapsed % 1000.0);
    }
    requestAnimationFrame(renderLoop);
  };
  requestAnimationFrame(renderLoop); // consistent 60FPS
});