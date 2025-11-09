import { TestBed } from '@angular/core/testing';

import { GoogleDrive } from './google-drive';

describe('GoogleDrive', () => {
  let service: GoogleDrive;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GoogleDrive);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
