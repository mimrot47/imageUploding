import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Imageeditor } from './imageeditor';

describe('Imageeditor', () => {
  let component: Imageeditor;
  let fixture: ComponentFixture<Imageeditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Imageeditor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Imageeditor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
