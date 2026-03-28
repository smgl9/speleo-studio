/*
 * Copyright 2024 Joe Meszaros
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { wm } from '../window.js';
import { i18n } from '../../i18n/i18n.js';

// ---------------------------------------------------------------------------
// UIS cave-cartography symbol templates.
// Each template is a flat array of 2-D segment pairs:
//   [x0, y0,  x1, y1,  x2, y2,  x3, y3, ...]
// where every consecutive pair (xi,yi)→(xi+1,yi+1) is ONE line segment.
// Coordinates are in the range [-1, 1] for both axes.
// They are transformed to world-space by _instantiateSymbol().
// ---------------------------------------------------------------------------

/** Build segment pairs for a polygon approximation of a circle. */
function _circle(cx, cy, r, n = 12) {
  const seg = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    seg.push(
      cx + Math.cos(a0) * r, cy + Math.sin(a0) * r,
      cx + Math.cos(a1) * r, cy + Math.sin(a1) * r
    );
  }
  return seg;
}

/** Build segment pairs for an ellipse. */
function _ellipse(cx, cy, rx, ry, n = 12) {
  const seg = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    seg.push(
      cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry,
      cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry
    );
  }
  return seg;
}

/** Small cross (dot marker for sand/stipple). */
function _cross(cx, cy, r) {
  return [cx - r, cy, cx + r, cy,  cx, cy - r, cx, cy + r];
}

// --------------------------------------------------------------------------
// Symbol template library
// --------------------------------------------------------------------------
const TEMPLATES = {

  // ── SPELEOTHEMS ──────────────────────────────────────────────────────────

  /** UIS stalactite: downward-pointing triangle hanging from ceiling. */
  stalactite: [
    -0.5,  0.75,   0,   -0.75,   // left to apex
     0,   -0.75,   0.5,  0.75,   // apex to right
     0.5,  0.75,  -0.5,  0.75,   // base line
  ],

  /** UIS stalagmite: upward-pointing triangle growing from floor. */
  stalagmite: [
    -0.5, -0.75,   0,    0.75,   // left to apex
     0,    0.75,   0.5, -0.75,   // apex to right
     0.5, -0.75,  -0.5, -0.75,   // base line
  ],

  /** UIS column: stalactite + stalagmite meeting at centre (hourglass). */
  column: [
    -0.5,  0.75,   0,     0,     // upper-left to centre
     0,     0,     0.5,  0.75,   // centre to upper-right
     0.5,  0.75,  -0.5,  0.75,   // top base
    -0.5, -0.75,   0,     0,     // lower-left to centre
     0,     0,     0.5, -0.75,   // centre to lower-right
     0.5, -0.75,  -0.5, -0.75,  // bottom base
  ],

  /** UIS helictite: erratic curving filament (zigzag). */
  helictite: [
    -0.9, -0.8,  -0.5,  0.1,
    -0.5,  0.1,   0.2, -0.5,
     0.2, -0.5,   0.7,  0.6,
     0.7,  0.6,   0.9, -0.1,
  ],

  /** Cave pearl: two concentric circles (pearl layers). */
  cavePearl: [
    ..._circle(0, 0, 0.75, 16),
    ..._circle(0, 0, 0.35, 8),
  ],

  /** Moonmilk: two overlapping blobs (soft calcite deposit). */
  moonmilk: [
    ..._ellipse(-0.3, 0, 0.5, 0.38, 10),
    ..._ellipse( 0.3, 0, 0.5, 0.38, 10),
  ],

  /** UIS calcite raft: horizontal lines at varying lengths. */
  calciteRaft: [
    -0.8,  0.6,   0.8,  0.6,
    -0.65, 0.2,   0.7,  0.2,
    -0.5, -0.2,   0.85,-0.2,
    -0.7, -0.6,   0.65,-0.6,
  ],

  // ── HYDROLOGY ────────────────────────────────────────────────────────────

  /** UIS underground stream: two parallel sinusoidal lines. */
  stream: [
    // upper wave
    -0.9, 0.25,  -0.6, 0.45,
    -0.6, 0.45,  -0.3, 0.25,
    -0.3, 0.25,   0.0, 0.05,
     0.0, 0.05,   0.3, 0.25,
     0.3, 0.25,   0.6, 0.45,
     0.6, 0.45,   0.9, 0.25,
    // lower wave
    -0.9,-0.25,  -0.6,-0.05,
    -0.6,-0.05,  -0.3,-0.25,
    -0.3,-0.25,   0.0,-0.45,
     0.0,-0.45,   0.3,-0.25,
     0.3,-0.25,   0.6,-0.05,
     0.6,-0.05,   0.9,-0.25,
  ],

  /** Underground lake / pool: multiple horizontal wavy lines. */
  lake: [
    -0.9, 0.65,  -0.6, 0.75,  -0.6, 0.75,  -0.3, 0.65,
    -0.3, 0.65,   0.0, 0.55,   0.0, 0.55,   0.3, 0.65,
     0.3, 0.65,   0.6, 0.75,   0.6, 0.75,   0.9, 0.65,
    -0.9, 0.2,   -0.6, 0.3,   -0.6, 0.3,   -0.3, 0.2,
    -0.3, 0.2,    0.0, 0.1,    0.0, 0.1,    0.3, 0.2,
     0.3, 0.2,    0.6, 0.3,    0.6, 0.3,    0.9, 0.2,
    -0.9,-0.25,  -0.6,-0.15,  -0.6,-0.15,  -0.3,-0.25,
    -0.3,-0.25,   0.0,-0.35,   0.0,-0.35,   0.3,-0.25,
     0.3,-0.25,   0.6,-0.15,   0.6,-0.15,   0.9,-0.25,
    -0.9,-0.7,   -0.6,-0.6,   -0.6,-0.6,   -0.3,-0.7,
    -0.3,-0.7,    0.0,-0.8,    0.0,-0.8,    0.3,-0.7,
     0.3,-0.7,    0.6,-0.6,    0.6,-0.6,    0.9,-0.7,
  ],

  /** UIS sump / siphon: U-shaped flooded passage. */
  sump: [
    -0.65, 0.85,  -0.65,-0.35,   // left wall
    -0.65,-0.35,   0,   -0.75,   // floor curve left
     0,   -0.75,   0.65,-0.35,   // floor curve right
     0.65,-0.35,   0.65, 0.85,   // right wall
    // water surface inside (wavy)
    -0.65, 0.1,  -0.35, 0.2,
    -0.35, 0.2,   0.0,  0.0,
     0.0,  0.0,   0.35, 0.2,
     0.35, 0.2,   0.65, 0.1,
  ],

  /** Waterfall: stepped cascade with splash pool. */
  waterfall: [
    -0.85, 0.75,  -0.2,  0.75,
    -0.2,  0.75,  -0.2,  0.15,
    -0.2,  0.15,   0.5,  0.15,
     0.5,  0.15,   0.5, -0.45,
     0.5, -0.45,   0.85,-0.45,
    // splash
    -0.75,-0.85,  -0.2, -0.65,
    -0.2, -0.65,   0.25,-0.85,
     0.25,-0.85,   0.7, -0.65,
  ],

  // ── FLOOR DEPOSITS ───────────────────────────────────────────────────────

  /** UIS breakdown / boulder pile: irregular rock outlines. */
  breakdown: [
    -0.8, 0.8,  -0.4, 0.9,
    -0.4, 0.9,   0.0, 0.7,
     0.0, 0.7,  -0.2, 0.4,
    -0.2, 0.4,  -0.8, 0.8,
     0.1, 0.9,   0.7, 0.7,
     0.7, 0.7,   0.9, 0.3,
     0.9, 0.3,   0.5, 0.2,
     0.5, 0.2,   0.1, 0.9,
    -0.6,-0.3,  -0.2, 0.2,
    -0.2, 0.2,   0.1,-0.1,
     0.1,-0.1,  -0.6,-0.3,
     0.3, 0.1,   0.8, 0.0,
     0.8, 0.0,   0.9,-0.4,
     0.9,-0.4,   0.4,-0.5,
     0.4,-0.5,   0.3, 0.1,
    -0.5,-0.5,  -0.1,-0.4,
    -0.1,-0.4,   0.0,-0.9,
     0.0,-0.9,  -0.7,-0.8,
    -0.7,-0.8,  -0.5,-0.5,
  ],

  /** UIS clay / mud: rows of small upward-pointing triangles. */
  clay: [
    // row 1
    -0.7,-0.1,  -0.5, 0.3,   -0.5, 0.3,  -0.3,-0.1,   -0.3,-0.1,  -0.7,-0.1,
    -0.1,-0.1,   0.1, 0.3,    0.1, 0.3,   0.3,-0.1,    0.3,-0.1,  -0.1,-0.1,
     0.5,-0.1,   0.7, 0.3,    0.7, 0.3,   0.9,-0.1,    0.9,-0.1,   0.5,-0.1,
    // row 2 (staggered, below)
    -0.9,-0.7,  -0.7,-0.3,   -0.7,-0.3,  -0.5,-0.7,   -0.5,-0.7,  -0.9,-0.7,
    -0.3,-0.7,  -0.1,-0.3,   -0.1,-0.3,   0.1,-0.7,    0.1,-0.7,  -0.3,-0.7,
     0.3,-0.7,   0.5,-0.3,    0.5,-0.3,   0.7,-0.7,    0.7,-0.7,   0.3,-0.7,
  ],

  /** UIS sand: stipple field of small cross marks. */
  sand: [
    ..._cross(-0.65, 0.65, 0.1),  ..._cross(-0.1,  0.65, 0.1),  ..._cross( 0.45, 0.65, 0.1),
    ..._cross( 0.8,  0.3,  0.1),  ..._cross(-0.8,  0.2,  0.1),  ..._cross(-0.3,  0.2,  0.1),
    ..._cross( 0.2,  0.2,  0.1),  ..._cross( 0.7, -0.1,  0.1),  ..._cross(-0.6, -0.2,  0.1),
    ..._cross(-0.1, -0.2,  0.1),  ..._cross( 0.4, -0.2,  0.1),  ..._cross( 0.8, -0.5,  0.1),
    ..._cross(-0.8, -0.6,  0.1),  ..._cross(-0.3, -0.6,  0.1),  ..._cross( 0.2, -0.6,  0.1),
    ..._cross( 0.7, -0.8,  0.1),
  ],

  /** UIS gravel / pebbles: scattered open circles. */
  gravel: [
    ..._circle(-0.5,  0.5,  0.24, 7),
    ..._circle( 0.1,  0.62, 0.2,  7),
    ..._circle( 0.62, 0.42, 0.22, 7),
    ..._circle(-0.7,  0.0,  0.18, 6),
    ..._circle( 0.0,  0.0,  0.25, 7),
    ..._circle( 0.62,-0.1,  0.2,  7),
    ..._circle(-0.5, -0.5,  0.22, 7),
    ..._circle( 0.1, -0.62, 0.18, 6),
    ..._circle( 0.7, -0.5,  0.2,  7),
  ],

  // ── GEOLOGICAL STRUCTURE ─────────────────────────────────────────────────

  /** UIS bedding plane: diagonal strike line with dip tick. */
  bedding: [
    -0.85, 0.85,  0.85,-0.85,  // strike line
     0.0,   0.0,  0.35, 0.35,  // dip tick
  ],

  /** UIS fault: line with relative-motion arrows. */
  fault: [
    -0.9,  0.2,   0.9,  0.2,   // fault trace
    // left block: upthrown arrow
    -0.65, 0.2,  -0.65, 0.65,
    -0.65, 0.65, -0.85, 0.45,
    -0.65, 0.65, -0.45, 0.45,
    // right block: downthrown arrow
     0.65, 0.2,   0.65,-0.2,
     0.65,-0.2,   0.45,-0.0,
     0.65,-0.2,   0.85,-0.0,
  ],

  /** UIS scallops: erosional bowl-shaped hollows in wall. */
  scallop: [
    -0.9,  0.0,   0.9,  0.0,   // wall baseline
    // three scallop arcs
    -0.9,  0.0,  -0.6,  0.6,   -0.6,  0.6,  -0.3,  0.0,
    -0.3,  0.0,   0.0,  0.6,    0.0,  0.6,   0.3,  0.0,
     0.3,  0.0,   0.6,  0.6,    0.6,  0.6,   0.9,  0.0,
  ],

  /** UIS pit / shaft: plan-view ellipse with depth arrows. */
  pit: [
    ..._ellipse(0, 0, 0.7, 0.45, 14),
    // depth arrows (top & bottom)
     0.0,  0.45,  0.0,  0.8,
     0.0,  0.8,  -0.12, 0.62,
     0.0,  0.8,   0.12, 0.62,
     0.0, -0.45,  0.0, -0.8,
     0.0, -0.8,  -0.12,-0.62,
     0.0, -0.8,   0.12,-0.62,
  ],

  /** Passage enlargement: double-headed vertical arrow. */
  enlargement: [
     0,   -0.85,  0,   0.85,
     0,    0.85, -0.25, 0.55,
     0,    0.85,  0.25, 0.55,
     0,   -0.85, -0.25,-0.55,
     0,   -0.85,  0.25,-0.55,
  ],

  // ── HAZARDS ──────────────────────────────────────────────────────────────

  /** Underwater / sump hazard: two wavy lines with down-arrow. */
  underwater: [
    -0.9, 0.4,  -0.6, 0.55,  -0.6, 0.55,  -0.3, 0.4,
    -0.3, 0.4,   0.0, 0.25,   0.0, 0.25,   0.3, 0.4,
     0.3, 0.4,   0.6, 0.55,   0.6, 0.55,   0.9, 0.4,
    -0.9,-0.4,  -0.6,-0.2,   -0.6,-0.2,   -0.3,-0.4,
    -0.3,-0.4,   0.0,-0.55,   0.0,-0.55,   0.3,-0.4,
     0.3,-0.4,   0.6,-0.2,    0.6,-0.2,    0.9,-0.4,
    // down arrow
     0.0,  0.4,   0.0, -0.4,
     0.0, -0.4,  -0.15,-0.2,
     0.0, -0.4,   0.15,-0.2,
  ],

  /** CO₂ hazard: circle with X (danger marker). */
  co2: [
    ..._circle(0, 0, 0.65, 14),
    -0.46, -0.46,  0.46,  0.46,
    -0.46,  0.46,  0.46, -0.46,
  ],

  /** Tight passage / squeeze: two converging curved walls. */
  squeeze: [
    -0.9,  0.85,  -0.4,  0.3,
    -0.4,  0.3,   -0.4, -0.3,
    -0.4, -0.3,   -0.9, -0.85,
     0.9,  0.85,   0.4,  0.3,
     0.4,  0.3,    0.4, -0.3,
     0.4, -0.3,    0.9, -0.85,
  ],

  /** Danger: warning triangle with exclamation mark. */
  danger: [
    -0.85,-0.75,  0.85,-0.75,
     0.85,-0.75,  0,    0.85,
     0,    0.85, -0.85,-0.75,
    // exclamation
     0,    0.5,   0,   -0.1,
     0,   -0.35,  0,   -0.55,
  ],

  // ── EQUIPMENT ────────────────────────────────────────────────────────────

  /** Fixed rope / rigging: interlocking horizontal loops. */
  rope: [
    -0.7,  0.8,  -0.7,  0.4,
    -0.7,  0.4,   0.7,  0.2,
     0.7,  0.2,   0.7, -0.2,
     0.7, -0.2,  -0.7, -0.4,
    -0.7, -0.4,  -0.7, -0.8,
    -0.9,  0.6,   0.9,  0.6,
    -0.9,  0.0,   0.9,  0.0,
    -0.9, -0.6,   0.9, -0.6,
  ],

  /** Ladder: two rails with four rungs. */
  ladder: [
    -0.4,  0.9,  -0.4, -0.9,
     0.4,  0.9,   0.4, -0.9,
    -0.4,  0.65,  0.4,  0.65,
    -0.4,  0.22,  0.4,  0.22,
    -0.4, -0.22,  0.4, -0.22,
    -0.4, -0.65,  0.4, -0.65,
  ],

  /** Foot peg (spit / bolt): horizontal bar bent up from wall. */
  footPeg: [
    -0.9,  0.0,   0.3,  0.0,
     0.3,  0.0,   0.3,  0.5,
     0.3,  0.5,   0.9,  0.5,
    // wall hatch
    -0.9, -0.5,  -0.9,  0.5,
    -1.0, -0.4,  -0.8, -0.4,
    -1.0,  0.4,  -0.8,  0.4,
  ],

  /** Staples: U-shaped bracket with horizontal attachment line. */
  staples: [
    -0.6,  0.6,  -0.6, -0.4,
    -0.6, -0.4,   0.6, -0.4,
     0.6, -0.4,   0.6,  0.6,
    -0.9,  0.2,   0.9,  0.2,
  ],
};

// ---------------------------------------------------------------------------

/**
 * Cave Sketch Tool – draws 3-D lines and procedural UIS symbols directly into
 * the Three.js scene.  All strokes exist in world space and are visible from
 * any camera orientation.
 *
 * Architecture:
 *   • A transparent div overlay sits on top of the WebGL canvas; while the
 *     tool is active it captures pointer events so that OrbitControls do not
 *     rotate the scene while the user is drawing.
 *   • Mouse positions are unprojected onto a plane perpendicular to the
 *     camera at the scene's control target (centre of the view).
 *   • Each stroke / symbol becomes a THREE.LineSegments2 object added to a
 *     persistent THREE.Group in the scene.
 *   • Undo pops the last added object.
 */
export class CaveSketchTool {
  /**
   * @param {import('../../scene/scene.js').MyScene} scene
   * @param {string} panel - CSS selector for the floating panel container
   */
  constructor(scene, panel = '#tool-panel') {
    this.scene     = scene;
    this.panel     = document.querySelector(panel);

    // Drawing state
    this.mode           = 'pen';   // pen | line | eraser | symbol
    this.color          = '#e63946';
    this.lineWidth      = 3;        // pixels
    this.selectedSymbol = null;
    this.symbolSize     = 2;        // world-unit radius for symbol stamps
    this.isDrawing      = false;

    // 3-D geometry
    this.drawingGroup = new THREE.Group();
    this.drawingGroup.name = 'cave-sketch';
    scene.addObjectToScene(this.drawingGroup);

    /** @type {LineSegments2[]} history stack for undo */
    this.history = [];

    // Live pen stroke state
    this._penPoints   = [];   // Array of THREE.Vector3 accumulated this stroke
    this._liveObject  = null; // LineSegments2 being drawn right now
    this._lineStart   = null; // THREE.Vector3 for line-tool start

    // Plane used to unproject mouse clicks to world coords
    this._drawPlane = new THREE.Plane();
    this._raycaster = new THREE.Raycaster();

    // Transparent overlay div (captures mouse so orbit controls are paused)
    this._overlay = null;
    this._createOverlay();

    // Bound event handlers
    this._onMouseDown  = this._mouseDown.bind(this);
    this._onMouseMove  = this._mouseMove.bind(this);
    this._onMouseUp    = this._mouseUp.bind(this);
    this._onMouseLeave = this._mouseLeave.bind(this);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  show() {
    wm.makeFloatingPanel(
      this.panel,
      (contentEl) => this._build(contentEl),
      'ui.panels.sketch.title',
      false,
      true,
      { width: 370, height: 'auto' },
      () => this._onPanelClose()
    );
  }

  // ---------------------------------------------------------------------------
  // Overlay lifecycle (transparent div for event capture)
  // ---------------------------------------------------------------------------

  _createOverlay() {
    if (this._overlay) return;
    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    this._overlay = document.createElement('div');
    this._overlay.id = 'sketch-overlay';
    this._overlay.className = 'sketch-overlay';
    viewport.appendChild(this._overlay);
  }

  _activateOverlay() {
    if (!this._overlay) this._createOverlay();
    this._overlay.classList.add('sketch-active');
    this._overlay.addEventListener('mousedown',  this._onMouseDown);
    this._overlay.addEventListener('mousemove',  this._onMouseMove);
    this._overlay.addEventListener('mouseup',    this._onMouseUp);
    this._overlay.addEventListener('mouseleave', this._onMouseLeave);
  }

  _deactivateOverlay() {
    if (!this._overlay) return;
    this._overlay.classList.remove('sketch-active');
    this._overlay.removeEventListener('mousedown',  this._onMouseDown);
    this._overlay.removeEventListener('mousemove',  this._onMouseMove);
    this._overlay.removeEventListener('mouseup',    this._onMouseUp);
    this._overlay.removeEventListener('mouseleave', this._onMouseLeave);
  }

  _onPanelClose() {
    this._cancelLiveStroke();
    this._deactivateOverlay();
  }

  // ---------------------------------------------------------------------------
  // World-coordinate computation
  // ---------------------------------------------------------------------------

  /**
   * Compute the NDC (Normalised Device Coordinates) for a mouse event.
   * @param {MouseEvent} e
   * @returns {THREE.Vector2}
   */
  _ndc(e) {
    const rect = this._overlay.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1
    );
  }

  /**
   * Unproject a mouse event to a world-space THREE.Vector3.
   * The drawing plane is perpendicular to the camera at the control target.
   * @param {MouseEvent} e
   * @returns {THREE.Vector3|null}
   */
  _worldPos(e) {
    const camera = this.scene.view.camera;

    // Plane: normal = camera forward direction, passing through control target
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const target = this.scene.view.control.getTarget();
    this._drawPlane.setFromNormalAndCoplanarPoint(camDir, target);

    this._raycaster.setFromCamera(this._ndc(e), camera);
    const pt = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._drawPlane, pt) === null) return null;
    return pt;
  }

  // ---------------------------------------------------------------------------
  // LineMaterial helper
  // ---------------------------------------------------------------------------

  _makeMaterial() {
    const canvas = this.scene.domElement;
    return new LineMaterial({
      color      : new THREE.Color(this.color),
      linewidth  : this.lineWidth,
      resolution : new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      worldUnits : false,
    });
  }

  // ---------------------------------------------------------------------------
  // Build LineSegments2 from a flat Float32Array of segment pairs
  // ---------------------------------------------------------------------------

  _buildLine(flatPositions) {
    const geo = new LineSegmentsGeometry();
    geo.setPositions(flatPositions);
    const mat = this._makeMaterial();
    return new LineSegments2(geo, mat);
  }

  // ---------------------------------------------------------------------------
  // Convert accumulated pen points to segment pairs
  // [p0, p1, p2, ...] → [p0, p1,  p1, p2,  p2, p3, ...]
  // ---------------------------------------------------------------------------

  _penPointsToSegments(points) {
    if (points.length < 2) return null;
    const flat = new Float32Array((points.length - 1) * 6);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      flat[i * 6 + 0] = a.x; flat[i * 6 + 1] = a.y; flat[i * 6 + 2] = a.z;
      flat[i * 6 + 3] = b.x; flat[i * 6 + 4] = b.y; flat[i * 6 + 5] = b.z;
    }
    return flat;
  }

  // ---------------------------------------------------------------------------
  // Symbol instantiation: 2-D template → 3-D world segments
  // ---------------------------------------------------------------------------

  /**
   * Transform a 2-D symbol template to world-space Float32Array segments.
   * @param {number[]} template  Flat [x0,y0, x1,y1, ...] 2-D segment pairs
   * @param {THREE.Vector3} center  World-space centre of the stamp
   * @param {number} size  Scale factor (world units)
   * @param {THREE.Vector3} right  Camera right vector (world space)
   * @param {THREE.Vector3} up     Camera up vector (world space)
   * @returns {Float32Array}
   */
  _instantiateSymbol(template, center, size, right, up) {
    const flat = new Float32Array(template.length * 3 / 2);
    for (let i = 0; i < template.length; i += 2) {
      const x = template[i], y = template[i + 1];
      const idx = (i / 2) * 3;
      flat[idx + 0] = center.x + right.x * x * size + up.x * y * size;
      flat[idx + 1] = center.y + right.y * x * size + up.y * y * size;
      flat[idx + 2] = center.z + right.z * x * size + up.z * y * size;
    }
    return flat;
  }

  /**
   * Stamp a UIS symbol at the given world-space point.
   * @param {string} symKey  Key into TEMPLATES
   * @param {THREE.Vector3} worldPt
   */
  _stampSymbol(symKey, worldPt) {
    const template = TEMPLATES[symKey];
    if (!template) return;

    const camera = this.scene.view.camera;
    const right  = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).normalize();
    const up     = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).normalize();

    const flat = this._instantiateSymbol(template, worldPt, this.symbolSize, right, up);
    const obj  = this._buildLine(flat);
    this._addToScene(obj);
  }

  // ---------------------------------------------------------------------------
  // Scene object management
  // ---------------------------------------------------------------------------

  _addToScene(obj) {
    this.drawingGroup.add(obj);
    this.history.push(obj);
    this._refreshUndoBtn();
    this.scene.view.renderView();
  }

  _undo() {
    const obj = this.history.pop();
    if (!obj) return;
    this.drawingGroup.remove(obj);
    obj.geometry.dispose();
    obj.material.dispose();
    this._refreshUndoBtn();
    this.scene.view.renderView();
  }

  // ---------------------------------------------------------------------------
  // Live-stroke helpers
  // ---------------------------------------------------------------------------

  /** Remove and dispose the transient preview object. */
  _removeLiveObject() {
    if (!this._liveObject) return;
    this.drawingGroup.remove(this._liveObject);
    this._liveObject.geometry.dispose();
    this._liveObject.material.dispose();
    this._liveObject = null;
  }

  /** Discard the current in-progress stroke without saving it. */
  _cancelLiveStroke() {
    this._removeLiveObject();
    this._penPoints  = [];
    this._lineStart  = null;
    this.isDrawing   = false;
  }

  // ---------------------------------------------------------------------------
  // Mouse events
  // ---------------------------------------------------------------------------

  _mouseDown(e) {
    if (e.button !== 0) return;
    const pt = this._worldPos(e);
    if (!pt) return;

    if (this.mode === 'eraser') {
      this._undo();
      return;
    }

    if (this.mode === 'symbol' && this.selectedSymbol) {
      this._stampSymbol(this.selectedSymbol, pt);
      return;
    }

    this.isDrawing = true;

    if (this.mode === 'pen') {
      this._penPoints = [pt];
    } else if (this.mode === 'line') {
      this._lineStart = pt;
    }
  }

  _mouseMove(e) {
    if (!this.isDrawing) return;
    const pt = this._worldPos(e);
    if (!pt) return;

    if (this.mode === 'pen') {
      this._penPoints.push(pt);
      const segs = this._penPointsToSegments(this._penPoints);
      if (!segs) return;
      this._removeLiveObject();
      this._liveObject = this._buildLine(segs);
      this.drawingGroup.add(this._liveObject);
      this.scene.view.renderView();

    } else if (this.mode === 'line' && this._lineStart) {
      const segs = new Float32Array([
        this._lineStart.x, this._lineStart.y, this._lineStart.z,
        pt.x, pt.y, pt.z,
      ]);
      this._removeLiveObject();
      this._liveObject = this._buildLine(segs);
      this.drawingGroup.add(this._liveObject);
      this.scene.view.renderView();
    }
  }

  _mouseUp(_e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this._liveObject) {
      // Promote the live preview to the permanent history
      this.drawingGroup.remove(this._liveObject);
      const saved = this._liveObject;
      this._liveObject = null;
      this._addToScene(saved);
    }

    this._penPoints = [];
    this._lineStart = null;
  }

  _mouseLeave() {
    if (this.isDrawing && this.mode === 'pen') {
      this._mouseUp();
    }
  }

  // ---------------------------------------------------------------------------
  // Panel UI
  // ---------------------------------------------------------------------------

  _build(contentEl) {
    this._activateOverlay();
    contentEl.innerHTML = '';

    // ── drawing tools ────────────────────────────────────────────────────────
    const toolsRow = this._section(i18n.t('ui.panels.sketch.drawingTools'));
    const tools = [
      { id: 'pen',    icon: 'icons/draft.svg',   label: i18n.t('ui.panels.sketch.tools.pen')    },
      { id: 'line',   icon: 'icons/splay.svg',   label: i18n.t('ui.panels.sketch.tools.line')   },
      { id: 'eraser', icon: 'icons/cancel.svg',  label: i18n.t('ui.panels.sketch.tools.eraser') },
      { id: 'symbol', icon: 'icons/label.svg',   label: i18n.t('ui.panels.sketch.tools.symbol') },
    ];
    const toolGroup = document.createElement('div');
    toolGroup.className = 'sketch-btn-group';
    tools.forEach((t) => {
      const btn = this._iconBtn(t.icon, t.label, () => {
        this.mode = t.id;
        toolGroup.querySelectorAll('.sketch-tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
      btn.classList.add('sketch-tool-btn');
      if (t.id === this.mode) btn.classList.add('active');
      toolGroup.appendChild(btn);
    });
    toolsRow.appendChild(toolGroup);
    contentEl.appendChild(toolsRow);

    // ── options ──────────────────────────────────────────────────────────────
    const optRow = this._section(i18n.t('ui.panels.sketch.options'));
    const optInner = document.createElement('div');
    optInner.className = 'sketch-options-inner';

    // color
    const colorLabel = document.createElement('label');
    colorLabel.textContent = i18n.t('ui.panels.sketch.color') + ' ';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = this.color;
    colorInput.className = 'sketch-color-input';
    colorInput.addEventListener('input', (ev) => { this.color = ev.target.value; });
    colorLabel.appendChild(colorInput);

    // line width
    const widthLabel = document.createElement('label');
    widthLabel.textContent = i18n.t('ui.panels.sketch.lineWidth') + ' ';
    const widthInput = document.createElement('input');
    widthInput.type  = 'range';
    widthInput.min   = 1;
    widthInput.max   = 12;
    widthInput.value = this.lineWidth;
    widthInput.className = 'sketch-width-input';
    const widthVal = document.createElement('span');
    widthVal.textContent = this.lineWidth + 'px';
    widthInput.addEventListener('input', (ev) => {
      this.lineWidth = parseInt(ev.target.value, 10);
      widthVal.textContent = this.lineWidth + 'px';
    });
    widthLabel.appendChild(widthInput);
    widthLabel.appendChild(widthVal);

    // symbol size
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = i18n.t('ui.panels.sketch.symbolSize') + ' ';
    const sizeInput = document.createElement('input');
    sizeInput.type  = 'range';
    sizeInput.min   = 1;
    sizeInput.max   = 20;
    sizeInput.value = this.symbolSize;
    sizeInput.className = 'sketch-width-input';
    const sizeVal = document.createElement('span');
    sizeVal.textContent = this.symbolSize;
    sizeInput.addEventListener('input', (ev) => {
      this.symbolSize = parseInt(ev.target.value, 10);
      sizeVal.textContent = this.symbolSize;
    });
    sizeLabel.appendChild(sizeInput);
    sizeLabel.appendChild(sizeVal);

    optInner.append(colorLabel, widthLabel, sizeLabel);
    optRow.appendChild(optInner);
    contentEl.appendChild(optRow);

    // ── symbol palette ────────────────────────────────────────────────────────
    const symRow = this._section(i18n.t('ui.panels.sketch.symbolsSection'));
    const palette = document.createElement('div');
    palette.className = 'sketch-symbol-palette';

    this._getSymbolCategories().forEach((cat) => {
      const catEl = document.createElement('div');
      catEl.className = 'sketch-symbol-category';

      const catLabel = document.createElement('div');
      catLabel.className = 'sketch-symbol-category-label';
      catLabel.textContent = i18n.t(cat.labelKey);
      catEl.appendChild(catLabel);

      const catRow = document.createElement('div');
      catRow.className = 'sketch-symbol-row';

      cat.symbols.forEach((sym) => {
        const btn = document.createElement('button');
        btn.className = 'sketch-symbol-btn';
        btn.title = i18n.t(sym.labelKey);

        // Preview rendered via an inline SVG canvas
        const preview = this._buildSymbolPreview(sym.key);
        btn.appendChild(preview);

        btn.addEventListener('click', () => {
          this.selectedSymbol = sym.key;
          this.mode = 'symbol';
          palette.querySelectorAll('.sketch-symbol-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          toolGroup.querySelectorAll('.sketch-tool-btn').forEach((b) => {
            b.classList.toggle('active', b.title === i18n.t('ui.panels.sketch.tools.symbol'));
          });
        });
        catRow.appendChild(btn);
      });

      catEl.appendChild(catRow);
      palette.appendChild(catEl);
    });

    symRow.appendChild(palette);
    contentEl.appendChild(symRow);

    // ── actions ───────────────────────────────────────────────────────────────
    const actionRow = document.createElement('div');
    actionRow.className = 'sketch-action-row';

    this._undoBtn = this._textBtn(i18n.t('ui.panels.sketch.undo'), () => this._undo());
    this._undoBtn.disabled = this.history.length === 0;
    actionRow.appendChild(this._undoBtn);

    const clearBtn = this._textBtn(i18n.t('ui.panels.sketch.clear'), () => {
      if (confirm(i18n.t('ui.panels.sketch.clearConfirm'))) {
        this.history.forEach((obj) => {
          this.drawingGroup.remove(obj);
          obj.geometry.dispose();
          obj.material.dispose();
        });
        this.history = [];
        this._refreshUndoBtn();
        this.scene.view.renderView();
      }
    });
    actionRow.appendChild(clearBtn);

    contentEl.appendChild(actionRow);
  }

  // ---------------------------------------------------------------------------
  // Small inline SVG canvas to preview a symbol inside its palette button
  // ---------------------------------------------------------------------------

  _buildSymbolPreview(key) {
    const template = TEMPLATES[key];
    const SIZE = 28;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', SIZE);
    svg.setAttribute('height', SIZE);
    svg.setAttribute('viewBox', '-1.1 -1.1 2.2 2.2');
    if (!template) return svg;
    for (let i = 0; i < template.length; i += 4) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', template[i]);
      // Flip Y: SVG Y goes down, our template Y goes up
      line.setAttribute('y1', -template[i + 1]);
      line.setAttribute('x2', template[i + 2]);
      line.setAttribute('y2', -template[i + 3]);
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-width', '0.1');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);
    }
    return svg;
  }

  // ---------------------------------------------------------------------------
  // Symbol categories
  // ---------------------------------------------------------------------------

  _getSymbolCategories() {
    return [
      {
        labelKey : 'ui.panels.sketch.categories.speleothems',
        symbols  : [
          { key: 'stalactite',  labelKey: 'ui.panels.sketch.symbols.stalactite'  },
          { key: 'stalagmite',  labelKey: 'ui.panels.sketch.symbols.stalagmite'  },
          { key: 'column',      labelKey: 'ui.panels.sketch.symbols.column'      },
          { key: 'helictite',   labelKey: 'ui.panels.sketch.symbols.helictite'   },
          { key: 'cavePearl',   labelKey: 'ui.panels.sketch.symbols.cavePearl'   },
          { key: 'moonmilk',    labelKey: 'ui.panels.sketch.symbols.moonmilk'    },
          { key: 'calciteRaft', labelKey: 'ui.panels.sketch.symbols.calciteRaft' },
        ]
      },
      {
        labelKey : 'ui.panels.sketch.categories.hydrology',
        symbols  : [
          { key: 'stream',    labelKey: 'ui.panels.sketch.symbols.stream'    },
          { key: 'lake',      labelKey: 'ui.panels.sketch.symbols.lake'      },
          { key: 'sump',      labelKey: 'ui.panels.sketch.symbols.sump'      },
          { key: 'waterfall', labelKey: 'ui.panels.sketch.symbols.waterfall' },
        ]
      },
      {
        labelKey : 'ui.panels.sketch.categories.floor',
        symbols  : [
          { key: 'breakdown', labelKey: 'ui.panels.sketch.symbols.breakdown' },
          { key: 'clay',      labelKey: 'ui.panels.sketch.symbols.clay'      },
          { key: 'sand',      labelKey: 'ui.panels.sketch.symbols.sand'      },
          { key: 'gravel',    labelKey: 'ui.panels.sketch.symbols.gravel'    },
        ]
      },
      {
        labelKey : 'ui.panels.sketch.categories.structure',
        symbols  : [
          { key: 'bedding',     labelKey: 'ui.panels.sketch.symbols.bedding'     },
          { key: 'fault',       labelKey: 'ui.panels.sketch.symbols.fault'       },
          { key: 'scallop',     labelKey: 'ui.panels.sketch.symbols.scallop'     },
          { key: 'pit',         labelKey: 'ui.panels.sketch.symbols.pit'         },
          { key: 'enlargement', labelKey: 'ui.panels.sketch.symbols.enlargement' },
        ]
      },
      {
        labelKey : 'ui.panels.sketch.categories.hazards',
        symbols  : [
          { key: 'underwater', labelKey: 'ui.panels.sketch.symbols.underwater' },
          { key: 'co2',        labelKey: 'ui.panels.sketch.symbols.co2'        },
          { key: 'squeeze',    labelKey: 'ui.panels.sketch.symbols.squeeze'     },
          { key: 'danger',     labelKey: 'ui.panels.sketch.symbols.danger'      },
        ]
      },
      {
        labelKey : 'ui.panels.sketch.categories.equipment',
        symbols  : [
          { key: 'rope',      labelKey: 'ui.panels.sketch.symbols.rope'      },
          { key: 'ladder',    labelKey: 'ui.panels.sketch.symbols.ladder'    },
          { key: 'footPeg',   labelKey: 'ui.panels.sketch.symbols.footPeg'   },
          { key: 'staples',   labelKey: 'ui.panels.sketch.symbols.staples'   },
        ]
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  _section(labelText) {
    const sec = document.createElement('div');
    sec.className = 'sketch-section';
    const lbl = document.createElement('div');
    lbl.className = 'sketch-section-label';
    lbl.textContent = labelText;
    sec.appendChild(lbl);
    return sec;
  }

  _iconBtn(src, tooltip, onClick) {
    const btn = document.createElement('button');
    btn.className = 'sketch-icon-btn';
    btn.title = tooltip;
    const img = document.createElement('img');
    img.src    = src;
    img.width  = 20;
    img.height = 20;
    btn.appendChild(img);
    btn.addEventListener('click', onClick);
    return btn;
  }

  _textBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'sketch-text-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  _refreshUndoBtn() {
    if (this._undoBtn) this._undoBtn.disabled = this.history.length === 0;
  }
}
