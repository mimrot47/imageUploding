import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow' | 'hide';

interface Shape {
  type: ShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

@Component({
  selector: 'app-imageeditor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './imageeditor.html',
  styleUrl: './imageeditor.css',
})
export class Imageeditor implements AfterViewInit {
  @ViewChild('myCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private img = new Image();
  imageLoaded = false;

  shapes: Shape[] = [];
  undoStack: Shape[][] = [];
  redoStack: Shape[][] = [];

  selectedTool: ShapeType = 'rectangle';
  selectedColor: string = '#ff0000';
  fillAlpha = 0.3;

  // Mouse state
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

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
  }

  // Upload image
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

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

  private resizeCanvasToImage(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = this.img.width;
    canvas.height = this.img.height;
  }

  // Mouse Events
  onMouseDown(event: MouseEvent): void {
    if (!this.imageLoaded) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

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

    // Check if clicking on resize handle
    if (this.selectedShapeIndex !== null) {
      const selected = this.shapes[this.selectedShapeIndex];
      const handle = this.getHandleAtPoint(selected, mouseX, mouseY);
      if (handle) {
        this.resizing = true;
        this.selectedHandle = handle;
        this.pushToUndo();
        return;
      }
    }

    // Check if clicking inside an existing shape
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

    // Start new shape
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

  onMouseMove(event: MouseEvent): void {
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

  onMouseUp(): void {
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

  // Resize Logic
  private resizeShape(shape: Shape, mouseX: number, mouseY: number): void {
    const { x, y, w, h } = shape;
    switch (this.selectedHandle) {
      case 'tl': // top-left
        shape.w = w + (x - mouseX);
        shape.h = h + (y - mouseY);
        shape.x = mouseX;
        shape.y = mouseY;
        break;
      case 'tr': // top-right
        shape.w = mouseX - x;
        shape.h = h + (y - mouseY);
        shape.y = mouseY;
        break;
      case 'bl': // bottom-left
        shape.w = w + (x - mouseX);
        shape.x = mouseX;
        shape.h = mouseY - y;
        break;
      case 'br': // bottom-right
        shape.w = mouseX - x;
        shape.h = mouseY - y;
        break;
    }
  }

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

  // Undo / Redo
  private pushToUndo(): void {
    this.undoStack.push(this.shapes.map((s) => ({ ...s })));
    this.redoStack = [];
  }

undo(): void {
  if (this.undoStack.length === 0) return;
  const prev = this.undoStack.pop()!;
  this.redoStack.push(this.shapes.map((s) => ({ ...s })));
  this.shapes = prev.map((s) => ({ ...s }));
  this.selectedShapeIndex = null; // ✅ reset selection
  this.redraw();
}

redo(): void {
  if (this.redoStack.length === 0) return;
  const next = this.redoStack.pop()!;
  this.undoStack.push(this.shapes.map((s) => ({ ...s })));
  this.shapes = next.map((s) => ({ ...s }));
  this.selectedShapeIndex = null; // ✅ reset selection
  this.redraw();
}

clear(): void {
  this.pushToUndo();
  this.shapes = [];
  this.selectedShapeIndex = null; // ✅ reset selection
  this.redraw();
}

  private redraw(): void {
    if (!this.ctx || !this.imageLoaded) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.ctx.drawImage(this.img, 0, 0, canvas.width, canvas.height);

    this.shapes.forEach((s, i) => this.drawShape(s, i === this.selectedShapeIndex));
    if (this.currentShape) this.drawShape(this.currentShape);
  }

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
    }

    if (selected && (s.type === 'rectangle' || s.type === 'hide' || s.type === 'circle')) {
      this.drawHandles(s);
    }

    ctx.restore();
  }

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

  private hexToRgba(hex: string, alpha: number): string {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  saveImage(): void {
    const canvas = this.canvasRef.nativeElement;
    const link = document.createElement('a');
    link.download = 'annotated-image.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}
