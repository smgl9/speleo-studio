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

import { wm } from '../window.js';
import { i18n } from '../../i18n/i18n.js';

/**
 * Cave Sketch Tool – draw passage outlines and place standard cave cartography
 * symbols on top of the 3D/plan viewport.
 *
 * Supported drawing modes:
 *   pen    – freehand strokes
 *   line   – straight lines (click-drag)
 *   eraser – remove drawn content
 *   symbol – click to stamp a cave-cartography symbol
 */
export class CaveSketchTool {
  /** @param {string} panel - CSS selector for the floating panel container */
  constructor(panel = '#tool-panel') {
    this.panel = document.querySelector(panel);

    // Drawing state
    this.mode = 'pen'; // pen | line | eraser | symbol
    this.color = '#e63946';
    this.lineWidth = 2;
    this.selectedSymbol = null;
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;

    // History for undo (array of ImageData snapshots)
    this.history = [];
    this.MAX_HISTORY = 30;

    // Canvas overlay (created on first show, persisted across show/hide)
    this.overlay = null;
    this.ctx = null;

    // Bound event handlers so we can remove them later
    this._onMouseDown = this._mouseDown.bind(this);
    this._onMouseMove = this._mouseMove.bind(this);
    this._onMouseUp = this._mouseUp.bind(this);
    this._onMouseLeave = this._mouseLeave.bind(this);
    this._onResize = this._syncOverlaySize.bind(this);

    // Reference to the snapshot drawn before a "line" stroke begins
    this._lineSnapshot = null;

    this._createOverlay();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  show() {
    wm.makeFloatingPanel(
      this.panel,
      (contentElmnt) => this._build(contentElmnt),
      'ui.panels.sketch.title',
      false,
      true,
      { width: 370, height: 'auto' },
      () => this._onPanelClose()
    );
  }

  // ---------------------------------------------------------------------------
  // Overlay canvas lifecycle
  // ---------------------------------------------------------------------------

  _createOverlay() {
    if (this.overlay) return;

    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    this.overlay = document.createElement('canvas');
    this.overlay.id = 'sketch-overlay';
    this.overlay.classList.add('sketch-overlay');
    this._syncOverlaySize();
    viewport.appendChild(this.overlay);

    this.ctx = this.overlay.getContext('2d');

    // Mouse events on the overlay canvas
    this.overlay.addEventListener('mousedown', this._onMouseDown);
    this.overlay.addEventListener('mousemove', this._onMouseMove);
    this.overlay.addEventListener('mouseup', this._onMouseUp);
    this.overlay.addEventListener('mouseleave', this._onMouseLeave);
    window.addEventListener('resize', this._onResize);
    document.addEventListener('viewport-resized', this._onResize);
  }

  _syncOverlaySize() {
    if (!this.overlay) return;
    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    // Save current drawing, resize, restore
    let imageData = null;
    if (this.ctx) {
      imageData = this.ctx.getImageData(0, 0, this.overlay.width, this.overlay.height);
    }

    this.overlay.width = viewport.clientWidth;
    this.overlay.height = viewport.clientHeight;

    if (this.ctx && imageData) {
      this.ctx.putImageData(imageData, 0, 0);
    }
  }

  _onPanelClose() {
    // Keep the overlay visible but deactivate it so 3-D interaction resumes
    this._deactivateOverlay();
  }

  _activateOverlay() {
    if (!this.overlay) this._createOverlay();
    this.overlay.classList.add('sketch-active');
  }

  _deactivateOverlay() {
    if (this.overlay) {
      this.overlay.classList.remove('sketch-active');
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing events
  // ---------------------------------------------------------------------------

  _getCanvasPos(e) {
    const rect = this.overlay.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  _saveSnapshot() {
    if (!this.ctx) return;
    const snap = this.ctx.getImageData(0, 0, this.overlay.width, this.overlay.height);
    this.history.push(snap);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
    this._refreshUndoBtn();
  }

  _mouseDown(e) {
    if (e.button !== 0) return;
    const pos = this._getCanvasPos(e);

    if (this.mode === 'symbol' && this.selectedSymbol) {
      this._saveSnapshot();
      this._stampSymbol(pos.x, pos.y);
      return;
    }

    this.isDrawing = true;
    this.startX = pos.x;
    this.startY = pos.y;

    if (this.mode === 'pen' || this.mode === 'eraser') {
      this._saveSnapshot();
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    } else if (this.mode === 'line') {
      // Save snapshot so we can redraw while dragging
      this._lineSnapshot = this.ctx.getImageData(0, 0, this.overlay.width, this.overlay.height);
      this._saveSnapshot();
    }
  }

  _mouseMove(e) {
    if (!this.isDrawing) return;
    const pos = this._getCanvasPos(e);

    if (this.mode === 'pen') {
      this._applyPenStyle();
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    } else if (this.mode === 'eraser') {
      this._applyEraserStyle();
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    } else if (this.mode === 'line' && this._lineSnapshot) {
      // Restore snapshot and redraw preview line
      this.ctx.putImageData(this._lineSnapshot, 0, 0);
      this._applyPenStyle();
      this.ctx.beginPath();
      this.ctx.moveTo(this.startX, this.startY);
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    }
  }

  _mouseUp() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this._lineSnapshot = null;
    if (this.mode === 'pen' || this.mode === 'eraser') {
      this.ctx.closePath();
    }
  }

  _mouseLeave() {
    if (this.isDrawing && this.mode === 'pen') {
      this.isDrawing = false;
      this.ctx.closePath();
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------------

  _applyPenStyle() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  _applyEraserStyle() {
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.lineWidth = this.lineWidth * 4;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  _stampSymbol(x, y) {
    if (!this.selectedSymbol) return;
    const size = 32;
    const img = new Image();
    img.onload = () => {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    };
    img.src = this.selectedSymbol.icon;
  }

  // ---------------------------------------------------------------------------
  // Panel UI
  // ---------------------------------------------------------------------------

  _build(contentEl) {
    this._activateOverlay();
    contentEl.innerHTML = '';

    // ---- drawing tools row -------------------------------------------------
    const toolsRow = this._row(i18n.t('ui.panels.sketch.drawingTools'));

    const tools = [
      { id: 'pen', icon: 'icons/draft.svg', label: i18n.t('ui.panels.sketch.tools.pen') },
      { id: 'line', icon: 'icons/splay.svg', label: i18n.t('ui.panels.sketch.tools.line') },
      { id: 'eraser', icon: 'icons/cancel.svg', label: i18n.t('ui.panels.sketch.tools.eraser') },
      { id: 'symbol', icon: 'icons/label.svg', label: i18n.t('ui.panels.sketch.tools.symbol') }
    ];

    const toolBtnGroup = document.createElement('div');
    toolBtnGroup.className = 'sketch-btn-group';

    tools.forEach((t) => {
      const btn = this._iconBtn(t.icon, t.label, () => {
        this.mode = t.id;
        toolBtnGroup.querySelectorAll('.sketch-tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.overlay.style.cursor = t.id === 'eraser' ? 'cell' : 'crosshair';
      });
      btn.classList.add('sketch-tool-btn');
      if (t.id === this.mode) btn.classList.add('active');
      toolBtnGroup.appendChild(btn);
    });

    toolsRow.appendChild(toolBtnGroup);
    contentEl.appendChild(toolsRow);

    // ---- color & width row -------------------------------------------------
    const optRow = this._row(i18n.t('ui.panels.sketch.options'));
    const optInner = document.createElement('div');
    optInner.className = 'sketch-options-inner';

    // Color picker
    const colorLabel = document.createElement('label');
    colorLabel.textContent = i18n.t('ui.panels.sketch.color') + ' ';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = this.color;
    colorInput.className = 'sketch-color-input';
    colorInput.addEventListener('input', (e) => (this.color = e.target.value));
    colorLabel.appendChild(colorInput);

    // Line width
    const widthLabel = document.createElement('label');
    widthLabel.textContent = i18n.t('ui.panels.sketch.lineWidth') + ' ';
    const widthInput = document.createElement('input');
    widthInput.type = 'range';
    widthInput.min = 1;
    widthInput.max = 12;
    widthInput.value = this.lineWidth;
    widthInput.className = 'sketch-width-input';
    const widthValue = document.createElement('span');
    widthValue.textContent = this.lineWidth + 'px';
    widthInput.addEventListener('input', (e) => {
      this.lineWidth = parseInt(e.target.value, 10);
      widthValue.textContent = this.lineWidth + 'px';
    });
    widthLabel.appendChild(widthInput);
    widthLabel.appendChild(widthValue);

    optInner.appendChild(colorLabel);
    optInner.appendChild(widthLabel);
    optRow.appendChild(optInner);
    contentEl.appendChild(optRow);

    // ---- cave symbol palette -----------------------------------------------
    const symRow = this._row(i18n.t('ui.panels.sketch.symbolsSection'));

    const categories = this._getSymbolCategories();
    const palette = document.createElement('div');
    palette.className = 'sketch-symbol-palette';

    categories.forEach((cat) => {
      const catEl = document.createElement('div');
      catEl.className = 'sketch-symbol-category';

      const catLabel = document.createElement('div');
      catLabel.className = 'sketch-symbol-category-label';
      catLabel.textContent = i18n.t(cat.labelKey);
      catEl.appendChild(catLabel);

      const catSymbols = document.createElement('div');
      catSymbols.className = 'sketch-symbol-row';

      cat.symbols.forEach((sym) => {
        const btn = this._symbolBtn(sym, palette);
        catSymbols.appendChild(btn);
      });

      catEl.appendChild(catSymbols);
      palette.appendChild(catEl);
    });

    symRow.appendChild(palette);
    contentEl.appendChild(symRow);

    // ---- action buttons ----------------------------------------------------
    const actionRow = document.createElement('div');
    actionRow.className = 'sketch-action-row';

    this._undoBtn = this._textBtn(i18n.t('ui.panels.sketch.undo'), () => this._undo());
    this._undoBtn.disabled = this.history.length === 0;
    actionRow.appendChild(this._undoBtn);

    const clearBtn = this._textBtn(i18n.t('ui.panels.sketch.clear'), () => {
      if (confirm(i18n.t('ui.panels.sketch.clearConfirm'))) {
        this.history = [];
        this._refreshUndoBtn();
        this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
      }
    });
    actionRow.appendChild(clearBtn);

    const exportBtn = this._textBtn(i18n.t('ui.panels.sketch.export'), () => this._exportSketch());
    actionRow.appendChild(exportBtn);

    contentEl.appendChild(actionRow);
  }

  _getSymbolCategories() {
    return [
      {
        labelKey : 'ui.panels.sketch.categories.speleothems',
        symbols  : [
          { icon: 'icons/dripstone.svg', labelKey: 'ui.panels.sketch.symbols.dripstone' },
          { icon: 'icons/speleothem.svg', labelKey: 'ui.panels.sketch.symbols.speleothem' },
          { icon: 'icons/helictite.svg', labelKey: 'ui.panels.sketch.symbols.helictite' },
          { icon: 'icons/calcite_raft.svg', labelKey: 'ui.panels.sketch.symbols.calciteRaft' },
          { icon: 'icons/other_speleothem.svg', labelKey: 'ui.panels.sketch.symbols.otherSpeleothem' }
        ]
      },
      {
        labelKey : 'ui.panels.sketch.categories.floor',
        symbols  : [
          { icon: 'icons/breakdown.svg', labelKey: 'ui.panels.sketch.symbols.breakdown' },
          { icon: 'icons/sediment.svg', labelKey: 'ui.panels.sketch.symbols.sediment' },
          { icon: 'icons/pavement.svg', labelKey: 'ui.panels.sketch.symbols.pavement' },
          { icon: 'icons/rock.svg', labelKey: 'ui.panels.sketch.symbols.rock' },
          { icon: 'icons/wall.svg', labelKey: 'ui.panels.sketch.symbols.wall' }
        ]
      },
      {
        labelKey : 'ui.panels.sketch.categories.structure',
        symbols  : [
          { icon: 'icons/bedding.svg', labelKey: 'ui.panels.sketch.symbols.bedding' },
          { icon: 'icons/fault.svg', labelKey: 'ui.panels.sketch.symbols.fault' },
          { icon: 'icons/phreatic.svg', labelKey: 'ui.panels.sketch.symbols.phreatic' },
          { icon: 'icons/enlargement.svg', labelKey: 'ui.panels.sketch.symbols.enlargement' }
        ]
      },
      {
        labelKey : 'ui.panels.sketch.categories.hazards',
        symbols  : [
          { icon: 'icons/underwater.svg', labelKey: 'ui.panels.sketch.symbols.underwater' },
          { icon: 'icons/co2.svg', labelKey: 'ui.panels.sketch.symbols.co2' },
          { icon: 'icons/squeeze.svg', labelKey: 'ui.panels.sketch.symbols.squeeze' },
          { icon: 'icons/danger.svg', labelKey: 'ui.panels.sketch.symbols.danger' }
        ]
      },
      {
        labelKey : 'ui.panels.sketch.categories.equipment',
        symbols  : [
          { icon: 'icons/rope.svg', labelKey: 'ui.panels.sketch.symbols.rope' },
          { icon: 'icons/ladder.svg', labelKey: 'ui.panels.sketch.symbols.ladder' },
          { icon: 'icons/foot_peg.svg', labelKey: 'ui.panels.sketch.symbols.footPeg' },
          { icon: 'icons/staples.svg', labelKey: 'ui.panels.sketch.symbols.staples' }
        ]
      }
    ];
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  _row(labelText) {
    const section = document.createElement('div');
    section.className = 'sketch-section';
    const label = document.createElement('div');
    label.className = 'sketch-section-label';
    label.textContent = labelText;
    section.appendChild(label);
    return section;
  }

  _iconBtn(src, tooltip, onClick) {
    const btn = document.createElement('button');
    btn.className = 'sketch-icon-btn';
    btn.title = tooltip;
    const img = document.createElement('img');
    img.src = src;
    img.width = 20;
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

  _symbolBtn(sym, palette) {
    const btn = document.createElement('button');
    btn.className = 'sketch-symbol-btn';
    btn.title = i18n.t(sym.labelKey);
    const img = document.createElement('img');
    img.src = sym.icon;
    img.width = 24;
    img.height = 24;
    img.alt = i18n.t(sym.labelKey);
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      // Select symbol and switch to symbol mode
      this.selectedSymbol = sym;
      this.mode = 'symbol';
      // Visually mark the selected button
      palette.querySelectorAll('.sketch-symbol-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Also activate symbol mode button in the tool row
      const panel = this.panel;
      if (panel) {
        panel.querySelectorAll('.sketch-tool-btn').forEach((b) => {
          b.classList.toggle('active', b.title === i18n.t('ui.panels.sketch.tools.symbol'));
        });
      }
      this.overlay.style.cursor = 'crosshair';
    });
    return btn;
  }

  // ---------------------------------------------------------------------------
  // Undo & export
  // ---------------------------------------------------------------------------

  _undo() {
    if (this.history.length === 0) return;
    const snap = this.history.pop();
    this.ctx.putImageData(snap, 0, 0);
    this._refreshUndoBtn();
  }

  _refreshUndoBtn() {
    if (this._undoBtn) {
      this._undoBtn.disabled = this.history.length === 0;
    }
  }

  _exportSketch() {
    const link = document.createElement('a');
    link.download = 'cave-sketch.png';
    link.href = this.overlay.toDataURL('image/png');
    link.click();
  }
}
