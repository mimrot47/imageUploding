/** types of shape annotations for image editor **/
export type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow' | 'hide' | 'text';
export interface Shape {
  type: ShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string; // ✅ for text content
  fontSize?: number;
}
