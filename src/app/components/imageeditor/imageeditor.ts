import { environment } from './../../../environments/environment.development';
import { Shape, ShapeType } from './../../model/pikshare';
import { AfterViewInit, Component, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { GoogleDrive } from '../../services/google-drive';

@Component({
  selector: 'app-imageeditor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatSelectModule,
    MatInputModule,
    MatIconModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatToolbarModule,
  ],
  templateUrl: './imageeditor.html',
  styleUrl: './imageeditor.css',
})
export class Imageeditor implements AfterViewInit {
  /** Get canvas reference */
  @ViewChild('myCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private CLIENT_ID = environment.CLIENT_ID;
  private API_KEY = environment.API_KEY;
  private SCOPES = environment.SCOPES;
  private drawing = false;
  private dragging = false;
  private resizing = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private selectedShapeIndex: number | null = null;
  private selectedHandle: string | null = null;
  private startX = 0;
  private startY = 0;
  private currentShape: Shape | null = null;
  private ctx!: CanvasRenderingContext2D;
  private img = new Image();
  private tokenClient: any;
  protected imageLoaded = false;
  private accessToken: string | null = null;
  protected imageName: string = '';
  protected originalFileName: string | null = null;
  protected lastUploadedLink: string | null = null;
  protected shapes: Shape[] = [];
  protected undoStack: Shape[][] = [];
  protected redoStack: Shape[][] = [];
  protected selectedTool: ShapeType = 'rectangle';
  protected selectedColor: string = '#ff0000';
  protected fillAlpha = 0.3;

  /**Initilize constractior
   * @param googleDrive GoogleDrive service
   */
  constructor(private googleDrive: GoogleDrive) {}

  /** Get convas reference */
  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
  }

  /** Handle paste image from clipboard
   * @param event ClipboardEvent
   */
  @HostListener('window:paste', ['$event'])
  protected onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          this.originalFileName = file.name || 'pasted-image.png';
          this.imageName = this.originalFileName.replace(/\.[^/.]+$/, '');
          console.log(this.originalFileName);
          this.loadImageFromFile(file);
        }
        event.preventDefault();
        break;
      }
    }
  }

/**
 * Upload annotated image to Google Drive
 * @return Promise<void>
 */
  protected async uploadToGoogleDrive(): Promise<void> {
    const canvas = this.canvasRef.nativeElement;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject('Failed to convert to Blob')), 'image/png');
    });
    const fileName = `annotated-${Date.now()}.png`;
    const publicUrl = await this.googleDrive.uploadFile(blob, fileName);
    this.lastUploadedLink = publicUrl;
    await navigator.clipboard.writeText(publicUrl);
    this.showToast('✅ Link copied to clipboard!');
  }

  /**
   * Reusable function for both file input and clipboard
   * @param file
   * @return void
   */
  private loadImageFromFile(file: File): void {
    this.originalFileName = file.name;
    this.imageName = file.name.replace(/\.[^/.]+$/, '');
    console.log(this.originalFileName); // remove file extension
    const reader = new FileReader();
    reader.onload = () => {
      this.img = new Image();
      this.img.onload = () => {
        this.imageLoaded = true;
        this.resizeCanvasToImage(); // resize to laptop screen size
        this.redraw();
      };
      this.img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Listen for keyboard events globally
   * @param event
   * @return void
   */
  @HostListener('window:keydown', ['$event'])
  protected handleKeyboard(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key.toLowerCase() === 'z') {
      // Ctrl + Z
      event.preventDefault();
      this.undo();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
      // Ctrl + Y
      event.preventDefault();
      this.redo();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      // Delete selected shape
      event.preventDefault();
      this.deleteSelectedShape();
    }
  }

 /**
  * Delete selected shape annotation
  * @return void
  */
  private deleteSelectedShape(): void {
    if (this.selectedShapeIndex !== null && this.selectedShapeIndex >= 0) {
      this.pushToUndo();
      this.shapes.splice(this.selectedShapeIndex, 1);
      this.selectedShapeIndex = null;
      this.redraw();
    }
  }

 /**
  * Copy last uploaded link to clipboard
  * @return void
  */
  protected copyLink() {
    if (this.lastUploadedLink) {
      navigator.clipboard.writeText(this.lastUploadedLink);
      this.showToast('🔗 Link copied again!');
    }
  }

  /**
   * Delete selected shape annotation
   * @param event trigger event on file selection
   * @returns void
   */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.originalFileName = file.name;
    console.log(this.originalFileName);
    const reader = new FileReader();
    reader.onload = () => {
      this.img = new Image();
      this.img.onload = () => {
        this.imageLoaded = true;
        this.resizeCanvasToImage();
        this.redraw();
      };
      this.img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Resize canvas to fit image within screen while maintaining aspect ratio
   * @return void
   */
  private resizeCanvasToImage(): void {
    const canvas = this.canvasRef.nativeElement;
    const maxWidth = window.innerWidth * 0.9; // 90% of screen width
    const maxHeight = window.innerHeight * 0.8; // 80% of screen height
    const imgWidth = this.img.width;
    const imgHeight = this.img.height;
    // Maintain aspect ratio
    let scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);
    const newWidth = imgWidth * scale;
    const newHeight = imgHeight * scale;
    // Set canvas size
    canvas.width = newWidth;
    canvas.height = newHeight;
    // Draw scaled image
    const ctx = this.ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.img, 0, 0, newWidth, newHeight);
  }

  /**
   * Handle mouse down event
   * @param event
   * @returns null<void>
   */
   protected onMouseDown(event: MouseEvent): void {
    if (!this.imageLoaded) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    if (this.selectedTool === 'text') {
      this.createTextInput(mouseX, mouseY);
      return;
    }
    // Check resize handle
    if (
      this.selectedShapeIndex !== null &&
      this.selectedShapeIndex >= 0 &&
      this.selectedShapeIndex < this.shapes.length
    ) {
      const selected = this.shapes[this.selectedShapeIndex];
      if (selected) {
        const handle = this.getHandleAtPoint(selected, mouseX, mouseY);
        if (handle) {
          this.resizing = true;
          this.selectedHandle = handle;
          this.pushToUndo();
          return;
        }
      }
    }

    // Check inside existing shape (move)
    const clickedIndex = this.shapes.findIndex(
      (s) => mouseX >= s.x && mouseX <= s.x + s.w && mouseY >= s.y && mouseY <= s.y + s.h
    );

    if (clickedIndex !== -1) {
      this.selectedShapeIndex = clickedIndex;
      const selected = this.shapes[clickedIndex];
      this.dragging = true;
      this.dragOffsetX = mouseX - selected.x;
      this.dragOffsetY = mouseY - selected.y;
      this.pushToUndo();
      this.redraw();
      return;
    }
    // Deselect
    this.selectedShapeIndex = null;
    this.redraw();
    // Draw new shape
    this.drawing = true;
    this.startX = mouseX;
    this.startY = mouseY;
    this.currentShape = {
      type: this.selectedTool,
      x: mouseX,
      y: mouseY,
      w: 0,
      h: 0,
      color: this.selectedColor,
    };
  }

  private createTextInput(x: number, y: number): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type text...';
    // Style input
    Object.assign(input.style, {
      position: 'fixed',
      left: `${rect.left + x}px`,
      top: `${rect.top + y}px`,
      font: '16px Arial',
      padding: '4px 6px',
      border: '1px solid #666',
      borderRadius: '6px',
      background: 'rgba(255,255,255,0.95)',
      color: '#000',
      zIndex: '2000',
      outline: 'none',
      minWidth: '80px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
    });
    document.body.appendChild(input);
    // Slight delay ensures browser properly focuses the field
    setTimeout(() => input.focus(), 0);
    const finalize = () => {
      const text = input.value.trim();
      if (text) {
        this.pushToUndo();
        this.shapes.push({
          type: 'text',
          x,
          y: y + 16,
          w: 0,
          h: 0,
          color: this.selectedColor || '#000',
          text,
          fontSize: 16,
        });
        this.redraw();
      }
      input.remove();
    };
    input.addEventListener('blur', finalize);
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation(); // ✅ prevent canvas or Angular capturing Backspace/Delete
      if (e.key === 'Enter') {
        e.preventDefault();
        finalize();
      } else if (e.key === 'Escape') {
        input.remove();
      }
    });
  }

  /**
   * show toast message copy link clipboard
   * @param message
   * @return void
   */
  private showToast(message: string) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = '#333';
    toast.style.color = '#fff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    toast.style.fontSize = '14px';
    toast.style.zIndex = '9999';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    document.body.appendChild(toast);
    // Animate in
    requestAnimationFrame(() => (toast.style.opacity = '1'));
    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
 /**
  * handle mouse move event
  * @param event get mouse move event
  * @returns null<void>
  */
  protected onMouseMove(event: MouseEvent): void {
    if (!this.imageLoaded) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    if (this.resizing && this.selectedShapeIndex !== null) {
      const shape = this.shapes[this.selectedShapeIndex];
      this.resizeShape(shape, mouseX, mouseY);
      this.redraw();
      return;
    }
    if (this.dragging && this.selectedShapeIndex !== null) {
      const shape = this.shapes[this.selectedShapeIndex];
      shape.x = mouseX - this.dragOffsetX;
      shape.y = mouseY - this.dragOffsetY;
      this.redraw();
      return;
    }
    if (this.drawing && this.currentShape) {
      this.currentShape.w = mouseX - this.startX;
      this.currentShape.h = mouseY - this.startY;
      this.redraw();
    }
  }

  /**
   * handle mouse up event
   * @returns null
   */
  protected onMouseUp(): void {
    if (this.resizing) {
      this.resizing = false;
      this.selectedHandle = null;
      this.redraw();
      return;
    }

    if (this.dragging) {
      this.dragging = false;
      this.redraw();
      return;
    }

    if (this.drawing) {
      this.drawing = false;
      if (
        this.currentShape &&
        Math.abs(this.currentShape.w) > 2 &&
        Math.abs(this.currentShape.h) > 2
      ) {
        this.pushToUndo();
        this.shapes.push(this.currentShape);
      }
      this.currentShape = null;
      this.redraw();
    }
  }

  /**
   * handle resize shape annotation
   * @param shape get shape to be resized
   * @param mouseX get mouseX according of canvas
   * @param mouseY get mouseY according of canvas
   * @return void
   */
  private resizeShape(shape: Shape, mouseX: number, mouseY: number): void {
    const { x, y, w, h } = shape;
    switch (this.selectedHandle) {
      case 'tl':
        shape.w = w + (x - mouseX);
        shape.h = h + (y - mouseY);
        shape.x = mouseX;
        shape.y = mouseY;
        break;
      case 'tr':
        shape.w = mouseX - x;
        shape.h = h + (y - mouseY);
        shape.y = mouseY;
        break;
      case 'bl':
        shape.w = w + (x - mouseX);
        shape.x = mouseX;
        shape.h = mouseY - y;
        break;
      case 'br':
        shape.w = mouseX - x;
        shape.h = mouseY - y;
        break;
    }
  }

  /**
   * get last point of shape for resizing handle null
   * @param shape get type of shape
   * @param x x axis of canvas
   * @param y y axis of canvas
   * @returns key
   */
  private getHandleAtPoint(shape: Shape, x: number, y: number): string | null {
    const size = 8;
    const handles = {
      tl: { x: shape.x, y: shape.y },
      tr: { x: shape.x + shape.w, y: shape.y },
      bl: { x: shape.x, y: shape.y + shape.h },
      br: { x: shape.x + shape.w, y: shape.y + shape.h },
    };

    for (const [key, val] of Object.entries(handles)) {
      if (x >= val.x - size && x <= val.x + size && y >= val.y - size && y <= val.y + size) {
        return key;
      }
    }
    return null;
  }
  /**
   * push current shapes to undo stack
   * @return void
   */
  private pushToUndo(): void {
    this.undoStack.push(this.shapes.map((s) => ({ ...s })));
    this.redoStack = [];
  }

/**
 * undo last action
 * @returns void
 */
  protected undo(): void {
    if (this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(this.shapes.map((s) => ({ ...s })));
    this.shapes = prev.map((s) => ({ ...s }));
    this.selectedShapeIndex = null;
    this.redraw();
  }

  /**
   * redo last undone action
   * @returns void
   */
  protected redo(): void {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(this.shapes.map((s) => ({ ...s })));
    this.shapes = next.map((s) => ({ ...s }));
    this.selectedShapeIndex = null;
    this.redraw();
  }

 /**
  * clear all shape annotations
  * @returns void
  */
  protected clear(): void {
    this.pushToUndo();
    this.shapes = [];
    this.selectedShapeIndex = null;
    this.redraw();
  }

/**
 * redraw canvas with image and shapes
 * @returns void
 */
  private redraw(): void {
    if (!this.ctx || !this.imageLoaded) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.ctx.drawImage(this.img, 0, 0, canvas.width, canvas.height);
    this.shapes.forEach((s, i) => this.drawShape(s, i === this.selectedShapeIndex));
    if (this.currentShape) this.drawShape(this.currentShape);
  }

  /**
   * drow shape annotation on canvas
   * @param s get shape type
   * @param selected get selected shape
   * @return void
   */
  private drawShape(s: Shape, selected = false): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = selected ? 'cyan' : s.color;
    ctx.fillStyle = s.type === 'hide' ? 'rgba(0,0,0,0.9)' : this.hexToRgba(s.color, this.fillAlpha);

    if (s.type === 'rectangle' || s.type === 'hide') {
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.type === 'circle') {
      ctx.beginPath();
      ctx.ellipse(
        s.x + s.w / 2,
        s.y + s.h / 2,
        Math.abs(s.w / 2),
        Math.abs(s.h / 2),
        0,
        0,
        2 * Math.PI
      );
      ctx.fill();
      ctx.stroke();
    } else if (s.type === 'line' || s.type === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.stroke();

      if (s.type === 'arrow') {
        const headlen = 10;
        const angle = Math.atan2(s.h, s.w);
        ctx.beginPath();
        ctx.moveTo(s.x + s.w, s.y + s.h);
        ctx.lineTo(
          s.x + s.w - headlen * Math.cos(angle - Math.PI / 6),
          s.y + s.h - headlen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(s.x + s.w, s.y + s.h);
        ctx.lineTo(
          s.x + s.w - headlen * Math.cos(angle + Math.PI / 6),
          s.y + s.h - headlen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    } else if (s.type === 'text' && s.text) {
      ctx.font = `${s.fontSize || 16}px Arial`;
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
    }
    if (selected && (s.type === 'rectangle' || s.type === 'hide' || s.type === 'circle')) {
      this.drawHandles(s);
    }
    ctx.restore();
  }

  /**
   * handle draw resize handles for selected shape
   * @param s get shape
   * @return void
   */
  private drawHandles(s: Shape): void {
    const ctx = this.ctx;
    const size = 6;
    const handles = [
      [s.x, s.y],
      [s.x + s.w, s.y],
      [s.x, s.y + s.h],
      [s.x + s.w, s.y + s.h],
    ];
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    handles.forEach(([x, y]) => {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    });
  }

  /**
   *
   * @param hex hexadecimal doe of color
   * @param alpha type of share
   * @returns string converted rgba color
   */
  private hexToRgba(hex: string, alpha: number): string {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /**
   * save annotated image to local disk
   * @returns void
   */
  saveImage(): void {
    const canvas = this.canvasRef.nativeElement;
    const link = document.createElement('a');
    const safeName = this.originalFileName?.trim() || 'annotated-image';
    link.download = `${safeName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    this.showToast(`💾 Saved as ${safeName}.png`);
  }

  /**
   * delete current image and reset editor state
   * @returns void
   */
  deleteImage(): void {
    if (!this.imageLoaded) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Reset all editor state
    this.imageLoaded = false;
    this.shapes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.lastUploadedLink = null;
    this.img = new Image();
  }
}
