/**
 * MISLend Image Cropper Modal
 * Lightweight, zero-dependency, touch-enabled HTML5 Canvas Image Cropper
 * Designed for MISLend Equipment Borrowing System
 */

(function () {
    // 1. Inject Styles
    const styleId = 'mislend-cropper-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .mislend-cropper-overlay {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.78);
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.25s ease, visibility 0.25s ease;
            }
            .mislend-cropper-overlay.active {
                opacity: 1;
                visibility: visible;
            }
            .mislend-cropper-modal {
                background: var(--bg-card, #ffffff);
                color: var(--text-primary, #0f172a);
                border: 1px solid var(--border, #e2e8f0);
                border-radius: 16px;
                width: 100%;
                max-width: 440px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                transform: scale(0.92);
                transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .mislend-cropper-overlay.active .mislend-cropper-modal {
                transform: scale(1);
            }
            .mislend-cropper-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 1rem 1.25rem;
                border-bottom: 1px solid var(--border, #e2e8f0);
            }
            .mislend-cropper-header h3 {
                margin: 0;
                font-size: 1.05rem;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
                color: var(--text-primary, #0f172a);
            }
            .mislend-cropper-close {
                background: transparent;
                border: none;
                font-size: 1.4rem;
                line-height: 1;
                cursor: pointer;
                color: var(--text-secondary, #64748b);
                border-radius: 8px;
                padding: 4px 8px;
                transition: background 0.15s ease, color 0.15s ease;
            }
            .mislend-cropper-close:hover {
                background: var(--bg-secondary, #f1f5f9);
                color: var(--danger, #ef4444);
            }
            .mislend-cropper-body {
                padding: 1.25rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 1rem;
            }
            .mislend-cropper-viewport-wrap {
                position: relative;
                width: 300px;
                height: 300px;
                max-width: 100%;
                border-radius: 12px;
                overflow: hidden;
                background: #090d16;
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                box-shadow: inset 0 0 20px rgba(0,0,0,0.6);
                cursor: grab;
            }
            .mislend-cropper-viewport-wrap:active {
                cursor: grabbing;
            }
            .mislend-cropper-viewport-wrap::after {
                content: '';
                position: absolute;
                width: 88%;
                aspect-ratio: 1;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                border: 2px dashed rgba(255, 255, 255, 0.85);
                border-radius: 50%;
                box-sizing: border-box;
                pointer-events: none;
                z-index: 1;
            }
            .mislend-cropper-canvas {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
            }
            .mislend-cropper-mask {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
            }
            .mislend-cropper-controls {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            .mislend-cropper-zoom-row {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
            }
            .mislend-cropper-btn-icon {
                background: var(--bg-secondary, #f1f5f9);
                color: var(--text-primary, #0f172a);
                border: 1px solid var(--border, #cbd5e1);
                border-radius: 8px;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.15s ease;
                font-size: 0.85rem;
                flex-shrink: 0;
            }
            .mislend-cropper-btn-icon:hover {
                background: var(--primary-light, #e0f2fe);
                color: var(--primary, #0284c7);
                border-color: var(--primary, #0284c7);
            }
            .mislend-cropper-slider {
                flex: 1;
                -webkit-appearance: none;
                appearance: none;
                height: 6px;
                background: var(--border, #cbd5e1);
                border-radius: 4px;
                outline: none;
                cursor: pointer;
            }
            .mislend-cropper-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: var(--primary, #1e40af);
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(0,0,0,0.25);
                transition: transform 0.1s ease;
            }
            .mislend-cropper-slider::-webkit-slider-thumb:hover {
                transform: scale(1.15);
            }
            .mislend-cropper-hints {
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: 100%;
                font-size: 0.75rem;
                color: var(--text-secondary, #64748b);
            }
            .mislend-cropper-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 1rem 1.25rem;
                border-top: 1px solid var(--border, #e2e8f0);
                background: var(--bg-secondary, #f8fafc);
            }
            .mislend-cropper-btn {
                padding: 8px 18px;
                font-size: 0.88rem;
                font-weight: 500;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.15s ease;
                border: none;
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
            .mislend-cropper-btn-cancel {
                background: var(--bg-card, #ffffff);
                color: var(--text-secondary, #64748b);
                border: 1px solid var(--border, #cbd5e1);
            }
            .mislend-cropper-btn-cancel:hover {
                background: var(--border, #e2e8f0);
                color: var(--text-primary, #0f172a);
            }
            .mislend-cropper-btn-apply {
                background: var(--primary, #1e40af);
                color: #ffffff;
            }
            .mislend-cropper-btn-apply:hover {
                background: var(--primary-dark, #1e3a8a);
                box-shadow: 0 4px 12px rgba(30, 64, 175, 0.3);
            }
        `;
        document.head.appendChild(style);
    }

    // 2. Cropper State & Controller
    class ImageCropperModal {
        constructor() {
            this.modal = null;
            this.canvas = null;
            this.ctx = null;
            this.maskCanvas = null;
            this.maskCtx = null;
            this.img = null;
            this.slider = null;

            // Transform state
            this.scale = 1;
            this.minScale = 0.5;
            this.maxScale = 3.5;
            this.rotation = 0;
            this.panX = 0;
            this.panY = 0;

            // Drag state
            this.isDragging = false;
            this.startX = 0;
            this.startY = 0;
            this.startPanX = 0;
            this.startPanY = 0;

            // Options
            this.options = {
                title: 'Adjust Profile Photo',
                shape: 'circle',
                outputSize: 350,
                onCrop: null,
                onCancel: null
            };

            this._initDOM();
        }

        _initDOM() {
            if (document.getElementById('mislendCropperOverlay')) {
                this.modal = document.getElementById('mislendCropperOverlay');
                return;
            }

            const overlay = document.createElement('div');
            overlay.id = 'mislendCropperOverlay';
            overlay.className = 'mislend-cropper-overlay';
            overlay.innerHTML = `
                <div class="mislend-cropper-modal" role="dialog" aria-modal="true">
                    <div class="mislend-cropper-header">
                        <h3 id="mislendCropperTitle">
                            <i class="fa-solid fa-crop"></i> Adjust & Crop Photo
                        </h3>
                        <button class="mislend-cropper-close" id="mislendCropperClose" aria-label="Close">&times;</button>
                    </div>
                    <div class="mislend-cropper-body">
                        <div class="mislend-cropper-viewport-wrap" id="mislendCropperViewport">
                            <canvas class="mislend-cropper-canvas" id="mislendCropperCanvas"></canvas>
                            <canvas class="mislend-cropper-mask" id="mislendCropperMask"></canvas>
                        </div>
                        <div class="mislend-cropper-controls">
                            <div class="mislend-cropper-zoom-row">
                                <button type="button" class="mislend-cropper-btn-icon" id="mislendCropperZoomOut" title="Zoom Out">
                                    <i class="fa-solid fa-minus"></i>
                                </button>
                                <input type="range" class="mislend-cropper-slider" id="mislendCropperSlider" min="0.5" max="3" step="0.01" value="1">
                                <button type="button" class="mislend-cropper-btn-icon" id="mislendCropperZoomIn" title="Zoom In">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                                <button type="button" class="mislend-cropper-btn-icon" id="mislendCropperRotate" title="Rotate 90°">
                                    <i class="fa-solid fa-rotate-right"></i>
                                </button>
                                <button type="button" class="mislend-cropper-btn-icon" id="mislendCropperReset" title="Reset">
                                    <i class="fa-solid fa-arrows-rotate"></i>
                                </button>
                            </div>
                            <div class="mislend-cropper-hints">
                                <span><i class="fa-solid fa-hand"></i> Drag to reposition</span>
                                <span><i class="fa-solid fa-magnifying-glass"></i> Scroll to zoom</span>
                            </div>
                        </div>
                    </div>
                    <div class="mislend-cropper-footer">
                        <button type="button" class="mislend-cropper-btn mislend-cropper-btn-cancel" id="mislendCropperCancel">
                            Cancel
                        </button>
                        <button type="button" class="mislend-cropper-btn mislend-cropper-btn-apply" id="mislendCropperApply">
                            <i class="fa-solid fa-check"></i> Apply Crop
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            this.modal = overlay;

            this.viewport = document.getElementById('mislendCropperViewport');
            this.canvas = document.getElementById('mislendCropperCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.maskCanvas = document.getElementById('mislendCropperMask');
            this.maskCtx = this.maskCanvas.getContext('2d');
            this.slider = document.getElementById('mislendCropperSlider');

            document.getElementById('mislendCropperClose').onclick = () => this.close();
            document.getElementById('mislendCropperCancel').onclick = () => this.close();
            document.getElementById('mislendCropperApply').onclick = () => this.applyCrop();

            document.getElementById('mislendCropperZoomIn').onclick = () => {
                this.setScale(this.scale + 0.15);
            };
            document.getElementById('mislendCropperZoomOut').onclick = () => {
                this.setScale(this.scale - 0.15);
            };
            document.getElementById('mislendCropperRotate').onclick = () => {
                this.rotation = (this.rotation + 90) % 360;
                this.render();
            };
            document.getElementById('mislendCropperReset').onclick = () => {
                this.resetTransform();
            };

            this.slider.oninput = (e) => {
                this.scale = parseFloat(e.target.value);
                this.render();
            };

            this._bindDragEvents();

            this.viewport.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.1 : -0.1;
                this.setScale(this.scale + delta);
            }, { passive: false });
        }

        _bindDragEvents() {
            const onPointerDown = (clientX, clientY) => {
                this.isDragging = true;
                this.startX = clientX;
                this.startY = clientY;
                this.startPanX = this.panX;
                this.startPanY = this.panY;
            };

            const onPointerMove = (clientX, clientY) => {
                if (!this.isDragging) return;
                const dx = clientX - this.startX;
                const dy = clientY - this.startY;
                this.panX = this.startPanX + dx;
                this.panY = this.startPanY + dy;
                this.render();
            };

            const onPointerUp = () => {
                this.isDragging = false;
            };

            this.viewport.addEventListener('mousedown', (e) => {
                onPointerDown(e.clientX, e.clientY);
            });
            window.addEventListener('mousemove', (e) => {
                onPointerMove(e.clientX, e.clientY);
            });
            window.addEventListener('mouseup', onPointerUp);

            this.viewport.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: true });

            window.addEventListener('touchmove', (e) => {
                if (e.touches.length === 1 && this.isDragging) {
                    onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: true });

            window.addEventListener('touchend', onPointerUp);
        }

        open({ file, imageSrc, title, shape, outputSize, onCrop, onCancel }) {
            this.options.title = title || 'Adjust Profile Photo';
            this.options.shape = shape || 'circle';
            this.options.outputSize = outputSize || 350;
            this.options.onCrop = onCrop;
            this.options.onCancel = onCancel;

            const titleEl = document.getElementById('mislendCropperTitle');
            if (titleEl) {
                titleEl.innerHTML = `<i class="fa-solid fa-crop"></i> ${this.options.title}`;
            }

            const loadImage = (src) => {
                const img = new Image();
                img.onload = () => {
                    this.img = img;
                    this._setupCanvasDimensions();
                    this.resetTransform();
                    this.modal.classList.add('active');
                };
                img.onerror = () => {
                    if (window.showToast) window.showToast('Failed to load image for cropping.', 'error');
                };
                img.src = src;
            };

            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => loadImage(e.target.result);
                reader.readAsDataURL(file);
            } else if (imageSrc) {
                loadImage(imageSrc);
            }
        }

        close() {
            this.modal.classList.remove('active');
            if (typeof this.options.onCancel === 'function') {
                this.options.onCancel();
            }
        }

        _setupCanvasDimensions() {
            const rect = this.viewport.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const w = rect.width || 300;
            const h = rect.height || 300;

            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(dpr, dpr);

            this.maskCanvas.width = w * dpr;
            this.maskCanvas.height = h * dpr;
            this.maskCtx.setTransform(1, 0, 0, 1, 0, 0);
            this.maskCtx.scale(dpr, dpr);

            this.viewportW = w;
            this.viewportH = h;
            this.cropRadius = Math.min(w, h) * 0.44; // 88% diameter
        }

        resetTransform() {
            if (!this.img) return;
            const minDim = Math.min(this.img.width, this.img.height);
            const targetDim = this.cropRadius * 2;

            const initialScale = Math.max(targetDim / minDim, 0.5);
            this.scale = initialScale;
            this.minScale = initialScale;
            this.maxScale = initialScale * 4;

            this.slider.min = this.minScale;
            this.slider.max = this.maxScale;
            this.slider.value = this.scale;

            this.rotation = 0;
            this.panX = 0;
            this.panY = 0;

            this.render();
        }

        setScale(newScale) {
            this.scale = Math.min(Math.max(newScale, this.minScale), this.maxScale);
            this.slider.value = this.scale;
            this.render();
        }

        render() {
            if (!this.img) return;

            const w = this.viewportW;
            const h = this.viewportH;
            const cx = w / 2;
            const cy = h / 2;

            this.ctx.clearRect(0, 0, w, h);

            this.ctx.save();
            this.ctx.translate(cx + this.panX, cy + this.panY);
            this.ctx.rotate((this.rotation * Math.PI) / 180);
            this.ctx.scale(this.scale, this.scale);
            this.ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
            this.ctx.restore();

            this._drawMask();
        }

        _drawMask() {
            const w = this.viewportW;
            const h = this.viewportH;
            const cx = w / 2;
            const cy = h / 2;
            const r = this.cropRadius;

            this.maskCtx.clearRect(0, 0, w, h);
            this.maskCtx.save();

            // Dark semi-transparent layer
            this.maskCtx.fillStyle = 'rgba(15, 23, 42, 0.65)';
            this.maskCtx.fillRect(0, 0, w, h);

            // Cut out circular or square crop area
            this.maskCtx.globalCompositeOperation = 'destination-out';
            this.maskCtx.beginPath();
            if (this.options.shape === 'circle') {
                this.maskCtx.arc(cx, cy, r, 0, Math.PI * 2, false);
            } else {
                this.maskCtx.rect(cx - r, cy - r, r * 2, r * 2);
            }
            this.maskCtx.fill();

            if (this.options.shape !== 'circle') {
                this.maskCtx.globalCompositeOperation = 'source-over';
                this.maskCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                this.maskCtx.lineWidth = 2;
                this.maskCtx.setLineDash([6, 6]);
                this.maskCtx.strokeRect(cx - r, cy - r, r * 2, r * 2);
            }

            this.maskCtx.restore();
        }

        applyCrop() {
            if (!this.img) return;

            const outSize = this.options.outputSize || 350;
            const offscreen = document.createElement('canvas');
            offscreen.width = outSize;
            offscreen.height = outSize;
            const octx = offscreen.getContext('2d');

            const targetRadius = this.cropRadius;
            const factor = (outSize / 2) / targetRadius;

            octx.save();

            if (this.options.shape === 'circle') {
                octx.beginPath();
                octx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2, false);
                octx.clip();
            }

            octx.translate(outSize / 2 + this.panX * factor, outSize / 2 + this.panY * factor);
            octx.rotate((this.rotation * Math.PI) / 180);
            octx.scale(this.scale * factor, this.scale * factor);
            octx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
            octx.restore();

            const croppedBase64 = offscreen.toDataURL('image/jpeg', 0.88);

            this.modal.classList.remove('active');

            if (typeof this.options.onCrop === 'function') {
                this.options.onCrop(croppedBase64);
            }
        }
    }

    let cropperInstance = null;

    window.openImageCropper = function (options) {
        if (!cropperInstance) {
            cropperInstance = new ImageCropperModal();
        }
        cropperInstance.open(options);
    };

})();
