import * as THREE from 'three';

// Photo places: a single photograph turned into 3D Gaussian splats by Apple's
// SHARP model (https://github.com/apple/ml-sharp), shown so that the visitor's
// eyes sit where the camera was.
//
//   sharp predict -i photo.jpg -o out/      ->  out/photo.ply
//
// To keep one, put the file in assets/splats/ and add a line here. It then
// shows up in the page bar and the in-VR panel. `.ply`, `.spz`, `.splat` and
// `.ksplat` files all load.
//
//   radius  how far the visitor may wander from the camera position, in metres.
//           A splat from one photo only holds together close to where it was
//           taken, so keep this small (default 1).
//   yaw     turn the picture about the vertical axis, in degrees.
//   scale   SHARP's output is in metres; change this if a scene feels too big or small.
//   convention  'opencv' (SHARP: x right, y down, z forward; the default) or
//           'three' for a splat that is already y-up.

export const PHOTOS = [
  { id: 'photo-halfmoonbay-1', name: 'Half Moon Bay 1', description: 'The coast at Half Moon Bay', url: 'assets/splats/HalfMoonBay1.ply' },
  { id: 'photo-halfmoonbay-2', name: 'Half Moon Bay 2', description: 'A second view of Half Moon Bay', url: 'assets/splats/HalfMoonBay2.ply' },
  { id: 'photo-room-1', name: 'Room 1', description: 'A room you can lean into', url: 'assets/splats/Room-1.ply' },
  { id: 'photo-room-2', name: 'Room 2', description: 'A room you can lean into', url: 'assets/splats/Room-2.ply' },
  { id: 'photo-room-3', name: 'Room 3', description: 'A room you can lean into', url: 'assets/splats/Room-3.ply' },
  { id: 'photo-room-4', name: 'Room 4', description: 'A room you can lean into', url: 'assets/splats/Room-4.ply' },
];

export const SPLAT_EXTENSIONS = ['.ply', '.spz', '.splat', '.ksplat'];
export const isSplatFile = (name) => SPLAT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

// The renderer is half a megabyte, so it is fetched only when a photo is opened.
let spark = null;
const loadSpark = () => (spark ??= import('../../vendor/spark.module.min.js'));

/** A small floating card for "loading" and "drop a file here" messages. */
function createSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.4),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.position.set(0, 0, -1.8);
  const write = (title, detail = '') => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(232, 236, 255, 0.92)';
    g.font = '500 54px system-ui, sans-serif';
    g.fillText(title, 512, detail ? 112 : 146, 980);
    g.fillStyle = 'rgba(190, 198, 230, 0.75)';
    g.font = '34px system-ui, sans-serif';
    g.fillText(detail, 512, 176, 980);
    texture.needsUpdate = true;
    mesh.visible = true;
  };
  return { mesh, write, hide: () => (mesh.visible = false) };
}

/**
 * Build a place around one splat file.
 *   def: { url?, radius?, yaw?, scale?, convention? }
 * Returns the usual place contract plus load(bytes, fileName) for swapping the picture.
 */
export function createPhotoPlace(def = {}) {
  const group = new THREE.Group();
  group.name = 'photo-place';

  // `anchor` is the camera position of the photograph. It is moved onto the
  // visitor's head each time they arrive, so the picture lines up whether
  // they are standing, sitting, or at a desk.
  const anchor = new THREE.Group();
  const frame = new THREE.Group(); // converts the file's axes to three.js's
  if ((def.convention ?? 'opencv') === 'opencv') frame.quaternion.set(1, 0, 0, 0); // half turn about x: y down -> up, z forward -> -z
  frame.scale.setScalar(def.scale ?? 1);
  anchor.rotation.y = THREE.MathUtils.degToRad(def.yaw ?? 0);
  anchor.add(frame);
  const sign = createSign();
  anchor.add(sign.mesh);
  group.add(anchor);

  let mesh = null;
  let request = 0;

  async function load(source, fileName) {
    const mine = ++request;
    sign.write('Loading the photo…', fileName || '');
    try {
      const { SplatMesh } = await loadSpark();
      const next = new SplatMesh(typeof source === 'string' ? { url: source } : { fileBytes: source, fileName });
      await next.initialized;
      if (mine !== request) return next.dispose(); // a newer picture was asked for meanwhile
      if (mesh) {
        frame.remove(mesh);
        mesh.dispose();
      }
      mesh = next;
      frame.add(mesh);
      sign.hide();
    } catch (err) {
      console.error('Could not load splat', err);
      if (mine === request) sign.write('That file could not be opened', 'It should be a .ply from “sharp predict”, or a .spz / .splat');
    }
  }

  if (def.url) load(def.url, def.url.split('/').pop());
  else sign.write('Drop a photo splat onto this page', 'A .ply made by “sharp predict” on your computer');

  let lastSeen = -Infinity;
  return {
    group,
    ground: { height: () => 0, radius: def.radius ?? 1 },
    spawn: [0, 0, 0],
    load,
    update(dt, t, head) {
      if (t - lastSeen > 0.25) anchor.position.copy(head); // just arrived: put the camera point at the eyes
      lastSeen = t;
    },
  };
}

// --- the drop-in slot ---------------------------------------------------------
// One scene is kept for whatever file was last dropped on the page.

let dropPlace = null;
let waiting = null;

export function createDropPlace() {
  dropPlace = createPhotoPlace({});
  if (waiting) dropPlace.load(waiting.bytes, waiting.name);
  waiting = null;
  return dropPlace;
}

/** Show a splat file from the visitor's own computer in the drop-in slot. Nothing is uploaded. */
export async function openSplatFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (dropPlace) dropPlace.load(bytes, file.name);
  else waiting = { bytes, name: file.name };
}
