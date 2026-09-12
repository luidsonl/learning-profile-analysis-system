import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';

import { AdminApprovals } from './approvals';
import { AdminUsers } from './users';

// Admin area (/admin, adminGuard): the approvals and the user management
// (ban + educator<->admin promotion/demotion) live as tabs on one page.
@Component({
  selector: 'app-admin-area',
  imports: [MatTabsModule, AdminApprovals, AdminUsers],
  templateUrl: './admin-area.html',
  styleUrl: './admin-area.scss',
})
export class AdminArea {}