import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentProfileView } from './student-profile-view';
import { StudentProfile } from './student-profile';

@Component({
  selector: 'app-student-profile-view',
  template: '<p>view {{ studentId }} {{ isOwn }}</p>',
  standalone: true,
})
class FakeView {
  @Input() studentId?: string;
  @Input() isOwn?: boolean;
}

describe('StudentProfile', () => {
  let fixture: ComponentFixture<StudentProfile>;

  beforeEach(async () => {
    TestBed.overrideComponent(StudentProfile, {
      remove: { imports: [StudentProfileView] },
      add: { imports: [FakeView] },
    });
    await TestBed.configureTestingModule({ imports: [StudentProfile] }).compileComponents();
    fixture = TestBed.createComponent(StudentProfile);
    fixture.componentRef.setInput('routeStudentId', 's9');
    fixture.detectChanges();
  });

  it('delegates to the profile view with the routed student id', () => {
    const paragraph = fixture.nativeElement.querySelector('p') as HTMLElement;
    expect(paragraph.textContent).toContain('view s9');
  });
});