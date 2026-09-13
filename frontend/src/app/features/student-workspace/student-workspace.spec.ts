import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { StudentsService } from '../../core/students/students.service';
import { StudentWorkspace } from './student-workspace';

const observation = {
  observationTimestamp: '2026-08-01T00:00:00Z',
  category: 'attention',
  text: 'Foco mantido em leitura.',
  rating: 4,
  submittedBy: 'u1',
};

const recommendation = {
  recoId: 'r1',
  kind: 'learning-strategy' as const,
  title: 'Leitura em voz alta',
  text: 'Ler trechos em voz alta para reforçar a compreensão.',
  tags: ['leitura'],
  status: 'proposed' as const,
  visibility: 'private' as const,
  source: null,
  createdBy: 'u1',
  createdAt: '2026-08-01T00:00:00Z',
};

const proposeSpy = vi.fn(() => of({ studentId: 's1', recoId: 'r2' }));
const updateSpy = vi.fn(() => of({ studentId: 's1', recoId: 'r1' }));
const grantSpy = vi.fn(() => of({}));
const revokeSpy = vi.fn(() => of({}));
const linkSpy = vi.fn(() => of({}));
const setConsentSpy = vi.fn(() => of({ studentId: 's1', consentVersion: '1.0', status: 'active', legalBasis: 'institution_authorization' }));
const searchSpy = vi.fn(() =>
  of({
    data: [
      { userId: 'gu1', name: 'Maria da Silva', email: 'maria@example.com' },
      { userId: 'gu2', name: 'João Pereira', email: 'joao@example.com' },
    ],
    count: 2,
  }),
);
const deleteSpy = vi.fn(() => of(undefined));

const studentsStub = {
  getStudent: () => of({ student: { studentId: 's1', name: 'Ana Lima', grade: '6º ano', status: 'active', createdBy: 'u1', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' } }),
  observations: () => of({ data: [observation], count: 1 }),
  recommendations: () => of({ data: [recommendation], count: 1 }),
  assessments: () => of({ data: [], count: 0 }),
  predictions: () => of({ data: [], count: 0 }),
  addObservation: () => of({}),
  deleteObservation: () => of({}),
  proposeRecommendation: proposeSpy,
  updateRecommendation: updateSpy,
  guardians: () => of({ data: [{ userId: 'gu1', name: 'Maria da Silva', email: 'maria@example.com', relation: 'guardian', grantedAt: '2026-08-01T00:00:00Z' }] }),
  searchGuardians: searchSpy,
  grantGuardian: grantSpy,
  revokeGuardian: revokeSpy,
  linkStudentAccount: linkSpy,
  consent: () => of({ current: { version: null, status: 'not_granted', consentAt: null, consentBy: null, legalBasis: null, grantedByRole: null }, history: [] }),
  setConsent: setConsentSpy,
  deleteStudent: deleteSpy,
};

const authStub = {
  user: () => ({ userId: 'u1', role: 'educator' }),
  studentAccounts: () =>
    of({
      data: [
        { userId: 'sid1', name: 'Pedro Alves', email: 'pedro@example.com', birthDate: '2011-09-30', createdAt: '2026-08-01T00:00:00Z', status: 'pending', available: true, linkedStudentId: null },
        { userId: 'sid2', name: 'Camila Rocha', email: 'camila@example.com', birthDate: '1995-03-01', createdAt: '2026-07-01T00:00:00Z', status: 'active', available: false, linkedStudentId: 's9' },
      ],
      count: 2,
    }),
};

// Tab order for an access manager (educator/admin): 0 Dados, 1 Perfil,
// 2 Avaliação, 3 Observações, 4 Recomendações, 5 Consentimento, 6 Acessos.
// Tab content is lazy, so text assertions must select the tab first.
function selectTab(fixture: ComponentFixture<StudentWorkspace>, index: number): void {
  fixture.componentInstance.selectedTabIndex.set(index);
  fixture.detectChanges();
}

function filteredGuardianCount(fixture: ComponentFixture<StudentWorkspace>): number {
  return fixture.componentInstance.filteredGuardians().length;
}

describe('StudentWorkspace', () => {
  let fixture: ComponentFixture<StudentWorkspace>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [StudentWorkspace],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: StudentsService, useValue: studentsStub },
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StudentWorkspace);
    fixture.componentRef.setInput('studentId', 's1');
    fixture.detectChanges();
  });

  it('renders the data tab with a remove action for an educator', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Dados do estudante');
    expect(text).toContain('Remover estudante');
  });

  it('removes the student from the data tab', () => {
    fixture.componentInstance.askDelete();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Excluir permanentemente');
    fixture.componentInstance.deleteStudent();
    expect(deleteSpy).toHaveBeenCalledWith('s1');
  });

  it('renders observations for the student', () => {
    selectTab(fixture, 3);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Foco mantido em leitura.');
  });

  it('renders proposed recommendations with a propose form', () => {
    selectTab(fixture, 4);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Leitura em voz alta');
    expect(text).toContain('Proposta');
  });

  it('proposes a recommendation from the form', () => {
    fixture.componentInstance.recoForm.setValue({ title: 'Mapas mentais', text: 'Usar organizadores gráficos.' });
    fixture.componentInstance.submitRecommendation();
    expect(proposeSpy).toHaveBeenCalledWith('s1', { title: 'Mapas mentais', text: 'Usar organizadores gráficos.' });
  });

  it('can approve a proposed recommendation', () => {
    fixture.componentInstance.updateRecommendation('r1', { status: 'approved' });
    expect(updateSpy).toHaveBeenCalledWith('s1', 'r1', { status: 'approved' });
  });

  it('renders the responsable management panel for an educator', () => {
    selectTab(fixture, 6);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Responsáveis');
    expect(text).toContain('Maria da Silva');
  });

  it('renders the guardian catalog with client-side filter', () => {
    selectTab(fixture, 6);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('João Pereira');
    expect(filteredGuardianCount(fixture)).toBe(2);

    fixture.componentInstance.onGuardianFilterInput('joao');
    fixture.detectChanges();
    expect(filteredGuardianCount(fixture)).toBe(1);
  });

  it('renders the LGPD consent tab with a grant form', () => {
    selectTab(fixture, 5);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Consentimento LGPD');
    expect(text).toContain('Conceder consentimento');
  });

  it('grants consent from the form', () => {
    fixture.componentInstance.consentForm.setValue({ version: '1.0', legalBasis: 'institution_authorization' });
    fixture.componentInstance.submitConsent('active');
    expect(setConsentSpy).toHaveBeenCalledWith('s1', { consentVersion: '1.0', status: 'active', legalBasis: 'institution_authorization' });
  });

  it('renders available accounts and accounts that cannot be reused', () => {
    selectTab(fixture, 6);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Conta de acesso');
    expect(text).toContain('Pedro Alves');
    expect(text).toContain('não pode ser usada');
  });

  it('shows the linked student account identity when present', () => {
    studentsStub.getStudent = () =>
      of({
        student: {
          studentId: 's1',
          name: 'Ana Lima',
          grade: '6º ano',
          status: 'active',
          createdBy: 'u1',
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-01T00:00:00Z',
          studentUserId: 'sid1',
          studentUser: { userId: 'sid1', name: 'Pedro Alves', email: 'pedro@example.com', status: 'active' },
        },
      });
    fixture.componentRef.setInput('studentId', 's2');
    fixture.detectChanges();
    selectTab(fixture, 6);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('pedro@example.com');
    expect(text).toContain('conta de acesso vinculada');
  });

  it('grants a responsable to the student', () => {
    fixture.componentInstance.grantGuardian('gu2');
    expect(grantSpy).toHaveBeenCalledWith('s1', 'gu2');
  });

  it('revokes a responsable from the student', () => {
    fixture.componentInstance.revokeGuardian('gu1');
    expect(revokeSpy).toHaveBeenCalledWith('s1', 'gu1');
  });

  it('links an available student account', () => {
    fixture.componentInstance.linkStudentAccount('sid1');
    expect(linkSpy).toHaveBeenCalledWith('s1', 'sid1');
  });

  it('loads the whole guardian catalog on open', () => {
    expect(searchSpy).toHaveBeenCalledWith('');
  });
});