import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

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
  private startX = 0;
  private startY = 0;
  private currentRect: Rect | null = null;

  rects: Rect[] = [];           // current rectangles
  undoStack: Rect[][] = [];     // for undo
  redoStack: Rect[][] = [];     // for redo
  rectAlpha = 0.25;

  imageLoaded = false;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
  }

  // 📸 Upload an image
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

  // 🎨 Drawing logic
  onMouseDown(event: MouseEvent): void {
    if (!this.imageLoaded) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.startX = event.clientX - rect.left;
    this.startY = event.clientY - rect.top;
    this.drawing = true;
    this.currentRect = { x: this.startX, y: this.startY, w: 0, h: 0 };
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.drawing || !this.imageLoaded) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const w = x - this.startX;
    const h = y - this.startY;

    this.currentRect = {
      x: w < 0 ? x : this.startX,
      y: h < 0 ? y : this.startY,
      w: Math.abs(w),
      h: Math.abs(h),
    };
    this.redraw();
  }

  onMouseUp(): void {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.currentRect && this.currentRect.w > 2 && this.currentRect.h > 2) {
      this.pushToUndo(); // save current state for undo
      this.rects.push(this.currentRect);
    }
    this.currentRect = null;
    this.redraw();
  }

  private pushToUndo(): void {
    this.undoStack.push([...this.rects]);
    this.redoStack = []; // clear redo when new change happens
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push([...this.rects]);
    this.rects = [...prev];
    this.redraw();
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push([...this.rects]);
    this.rects = [...next];
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

    for (const r of this.rects) this.drawRect(r);
    if (this.currentRect) this.drawRect(this.currentRect);
  }

  private drawRect(r: Rect): void {
    this.ctx.fillStyle = `rgba(255,200,0,${this.rectAlpha})`;
    this.ctx.fillRect(r.x, r.y, r.w, r.h);
    this.ctx.strokeStyle = 'red';
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
