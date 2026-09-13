import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';

import { AdminApprovals } from './approvals';
import { AdminUsers } from './users';

// Admin area (/admin, adminOrEducatorGuard): approvals and user management
// live as tabs on one page. Educators get a role-conditional UI — they only
// approve/deny guardian and student accounts (status only); role change,
// password reset and delete stay admin-gated.
@Component({
  selector: 'app-admin-area',
  imports: [MatTabsModule, AdminApprovals, AdminUsers],
  templateUrl: './admin-area.html',
  styleUrl: './admin-area.scss',
})
export class AdminArea {}