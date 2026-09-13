import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { FormResponse, FormsList } from '../api/types';

@Injectable({ providedIn: 'root' })
export class FormsService {
  private readonly http = inject(HttpClient);

  getForm(formId: string) {
    return this.http.get<FormResponse>(`/api/forms/${formId}`);
  }

  listForms() {
    return this.http.get<FormsList>('/api/forms');
  }
}