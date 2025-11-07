import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Imageeditor } from './components/imageeditor/imageeditor';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Imageeditor],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('imageUploding');
}
