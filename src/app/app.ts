import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OrgTree } from './org-tree/org-tree';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, OrgTree],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('demo-sortable-tree');
}
