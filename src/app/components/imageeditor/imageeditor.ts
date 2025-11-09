import { AfterViewInit, Component, ElementRef, ViewChild, HostListener } from '@angular/core';
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
  private CLIENT_ID = '402622394318-d1l4vbfgaqndnidbmsdmjtmj52d4j574.apps.googleusercontent.com';
  private API_KEY = 'AIzaSyAZ9jPeATDM0Qdzi4ghjRXfzioskCoT0xI'; // Optional for Drive v3
  private SCOPES = 'https://www.googleapis.com/auth/drive.file';
  private accessToken: string | null = null;

private gapiLoaded = false;

  private ctx!: CanvasRenderingContext2D;
  private img = new Image();
  imageLoaded = false;
  lastUploadedLink: string | null = null;

  shapes: Shape[] = [];
  undoStack: Shape[][] = [];
  redoStack: Shape[][] = [];

  selectedTool: ShapeType = 'rectangle';
  selectedColor: string = '#ff0000';
  fillAlpha = 0.3;

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
  // 🔹 Handle paste (Ctrl + V)
@HostListener('window:paste', ['$event'])
onPaste(event: ClipboardEvent): void {
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        this.loadImageFromFile(file);
      }
      event.preventDefault();
      break;
    }
  }
}



// Initialize gapi client and GIS token client
async initGoogleAPI() {
  return new Promise<void>((resolve, reject) => {
    const g = (window as any);
    if (!g.gapi) {
      return reject('Google API not loaded');
    }

    g.gapi.load('client', async () => {
      try {
        await g.gapi.client.init({
          apiKey: this.API_KEY,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });

        // Initialize the new GIS client
        this.initTokenClient();
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

private tokenClient: any;

initTokenClient() {
  const google = (window as any).google;
  this.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: this.CLIENT_ID,
    scope: this.SCOPES,
    callback: (response: any) => {
      if (response && response.access_token) {
        this.accessToken = response.access_token;
        this.finishUploadToDrive();
      }
    },
  });
}

async uploadToGoogleDrive(): Promise<void> {
  if (!this.accessToken) {
    await this.initGoogleAPI();
    // Prompt user to sign in and grant access
    this.tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    this.finishUploadToDrive();
  }
}

private async finishUploadToDrive() {

  if (!this.accessToken) {
    alert('⚠️ No access token found.');
    return;
  }

  const canvas = this.canvasRef.nativeElement;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject('Failed to convert to Blob')), 'image/png');
  });

  const metadata = {
    name: `annotated-${Date.now()}.png`,
    mimeType: 'image/png',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  // Upload file
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: new Headers({ Authorization: 'Bearer ' + this.accessToken }),
    body: form,
  });

  const file = await res.json();

  // Make file public
  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
  method: 'POST',
  headers: new Headers({
    Authorization: 'Bearer ' + this.accessToken,
    'Content-Type': 'application/json',
  }),
  body: JSON.stringify({ role: 'reader', type: 'anyone' }),
});

// Build direct-view URL
const publicUrl = `https://drive.google.com/uc?export=view&id=${file.id}`;

// Copy link to clipboard
await navigator.clipboard.writeText(publicUrl);

// Show toast message instead of alert
this.showToast('✅ Link copied to clipboard!');

}
// 🔹 Reusable function for both file input and clipboard
private loadImageFromFile(file: File): void {
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


  // ⌨️ Listen for keyboard events globally
  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
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

  // 🗑️ Delete selected shape
  deleteSelectedShape(): void {
    if (this.selectedShapeIndex !== null && this.selectedShapeIndex >= 0) {
      this.pushToUndo();
      this.shapes.splice(this.selectedShapeIndex, 1);
      this.selectedShapeIndex = null;
      this.redraw();
    }
  }

  copyLink() {
  if (this.lastUploadedLink) {
    navigator.clipboard.writeText(this.lastUploadedLink);
    this.showToast('🔗 Link copied again!');
  }
}

  // Upload Image
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

  // 🔹 Get available space (viewport size minus some padding)
  const maxWidth = window.innerWidth * 0.9;  // 90% of screen width
  const maxHeight = window.innerHeight * 0.8; // 80% of screen height

  const imgWidth = this.img.width;
  const imgHeight = this.img.height;

  // 🔹 Maintain aspect ratio
  let scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);

  const newWidth = imgWidth * scale;
  const newHeight = imgHeight * scale;

  // 🔹 Set canvas size
  canvas.width = newWidth;
  canvas.height = newHeight;

  // 🔹 Draw scaled image
  const ctx = this.ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(this.img, 0, 0, newWidth, newHeight);
}


  // 🖱️ Mouse Events
  onMouseDown(event: MouseEvent): void {
    if (!this.imageLoaded) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 1️⃣ Check resize handle
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

    // 2️⃣ Check inside existing shape (move)
    const clickedIndex = this.shapes.findIndex(
      (s) =>
        mouseX >= s.x &&
        mouseX <= s.x + s.w &&
        mouseY >= s.y &&
        mouseY <= s.y + s.h
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

    // 3️⃣ Deselect
    this.selectedShapeIndex = null;
    this.redraw();

    // 4️⃣ Draw new shape
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
  showToast(message: string) {
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

  private getHandleAtPoint(shape: Shape, x: number, y: number): string | null {
    const size = 8;
    const handles = {
      tl: { x: shape.x, y: shape.y },
      tr: { x: shape.x + shape.w, y: shape.y },
      bl: { x: shape.x, y: shape.y + shape.h },
      br: { x: shape.x + shape.w, y: shape.y + shape.h },
    };

    for (const [key, val] of Object.entries(handles)) {
      if (
        x >= val.x - size &&
        x <= val.x + size &&
        y >= val.y - size &&
        y <= val.y + size
      ) {
        return key;
      }
    }
    return null;
  }

  private pushToUndo(): void {
    this.undoStack.push(this.shapes.map((s) => ({ ...s })));
    this.redoStack = [];
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(this.shapes.map((s) => ({ ...s })));
    this.shapes = prev.map((s) => ({ ...s }));
    this.selectedShapeIndex = null;
    this.redraw();
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(this.shapes.map((s) => ({ ...s })));
    this.shapes = next.map((s) => ({ ...s }));
    this.selectedShapeIndex = null;
    this.redraw();
  }

  clear(): void {
    this.pushToUndo();
    this.shapes = [];
    this.selectedShapeIndex = null;
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
    ctx.fillStyle =
      s.type === 'hide'
        ? 'rgba(0,0,0,0.9)'
        : this.hexToRgba(s.color, this.fillAlpha);

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

    if (
      selected &&
      (s.type === 'rectangle' || s.type === 'hide' || s.type === 'circle')
    ) {
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
