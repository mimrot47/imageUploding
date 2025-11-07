import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  private drawing = false;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private selectedRectIndex: number | null = null;

  private startX = 0;
  private startY = 0;
  private currentRect: Rect | null = null;

  rects: Rect[] = [];
  undoStack: Rect[][] = [];
  redoStack: Rect[][] = [];
  rectAlpha = 0.25;

  imageLoaded = false;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
  }

  // 📸 Upload image
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

  // 🎨 Mouse Events
  onMouseDown(event: MouseEvent): void {
    if (!this.imageLoaded) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if clicking inside an existing rect (for move)
    const clickedIndex = this.rects.findIndex(
      (r) =>
        mouseX >= r.x &&
        mouseX <= r.x + r.w &&
        mouseY >= r.y &&
        mouseY <= r.y + r.h
    );

    if (clickedIndex !== -1) {
      // Start dragging existing rectangle
      this.selectedRectIndex = clickedIndex;
      const selectedRect = this.rects[clickedIndex];
      this.dragging = true;
      this.dragOffsetX = mouseX - selectedRect.x;
      this.dragOffsetY = mouseY - selectedRect.y;
      this.pushToUndo();
      return;
    }

    // Otherwise start drawing new rectangle
    this.drawing = true;
    this.startX = mouseX;
    this.startY = mouseY;
    this.currentRect = { x: mouseX, y: mouseY, w: 0, h: 0 };
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.imageLoaded) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Moving existing rectangle
    if (this.dragging && this.selectedRectIndex !== null) {
      const selected = this.rects[this.selectedRectIndex];
      selected.x = mouseX - this.dragOffsetX;
      selected.y = mouseY - this.dragOffsetY;
      this.redraw();
      return;
    }

    // Drawing new rectangle
    if (this.drawing) {
      const w = mouseX - this.startX;
      const h = mouseY - this.startY;
      this.currentRect = {
        x: w < 0 ? mouseX : this.startX,
        y: h < 0 ? mouseY : this.startY,
        w: Math.abs(w),
        h: Math.abs(h),
      };
      this.redraw();
    }
  }

  onMouseUp(): void {
    if (this.dragging) {
      this.dragging = false;
      this.selectedRectIndex = null;
      this.redraw();
      return;
    }

    if (this.drawing) {
      this.drawing = false;
      if (this.currentRect && this.currentRect.w > 2 && this.currentRect.h > 2) {
        this.pushToUndo();
        this.rects.push(this.currentRect);
      }
      this.currentRect = null;
      this.redraw();
    }
  }

  // 🔁 Undo / Redo
  private pushToUndo(): void {
    this.undoStack.push(this.rects.map(r => ({ ...r })));
    this.redoStack = [];
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(this.rects.map(r => ({ ...r })));
    this.rects = prev.map(r => ({ ...r }));
    this.redraw();
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(this.rects.map(r => ({ ...r })));
    this.rects = next.map(r => ({ ...r }));
    this.redraw();
  }

  clearRects(): void {
    if (!this.rects.length) return;
    this.pushToUndo();
    this.rects = [];
    this.redraw();
  }

  // 🖼️ Redraw everything
  private redraw(): void {
    if (!this.ctx || !this.imageLoaded) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.ctx.drawImage(this.img, 0, 0, canvas.width, canvas.height);

    this.rects.forEach((r, i) => this.drawRect(r, i === this.selectedRectIndex));
    if (this.currentRect) this.drawRect(this.currentRect);
  }

  private drawRect(r: Rect, selected = false): void {
    this.ctx.fillStyle = selected
      ? `rgba(0,255,255,${this.rectAlpha})`
      : `rgba(255,200,0,${this.rectAlpha})`;
    this.ctx.fillRect(r.x, r.y, r.w, r.h);
    this.ctx.strokeStyle = selected ? 'cyan' : 'red';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  // 💾 Save annotated image
  saveImage(): void {
    if (!this.imageLoaded) return;
    const canvas = this.canvasRef.nativeElement;
    const link = document.createElement('a');
    link.download = 'annotated-image.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}
