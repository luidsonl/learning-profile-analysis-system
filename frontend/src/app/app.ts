import { Component, inject } from '@angular/core';

import { AuthService } from './core/auth/auth.service';
import { AppShell } from './layout/app-shell';

@Component({
  selector: 'app-root',
  imports: [AppShell],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);

  constructor() {
    // Rehydrate the session (user + studentId) when the tab reloads with a token.
    if (this.auth.isAuthenticated()) {
      this.auth.me().subscribe();
    }
  }
}