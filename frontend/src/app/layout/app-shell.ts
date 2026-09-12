import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NgIf } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { map } from 'rxjs';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ROLE_LABELS } from '../core/users/user-labels';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIf,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly breakpoint = inject(BreakpointObserver);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  // Handset (< 600 px) opens the nav as an overlay drawer; larger screens use rail/sidebar.
  protected readonly isHandset = toSignal(
    this.breakpoint.observe(Breakpoints.Handset).pipe(map((state) => state.matches)),
  );

  protected readonly roleLabel = computed(() =>
    this.auth.user() ? ROLE_LABELS[this.auth.user()!.role] : '',
  );

  logout(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigateByUrl('/login'),
    });
  }
}