import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment.development';


@Injectable({
  providedIn: 'root',
})
export class GoogleDrive {
  private API_KEY = environment.API_KEY;
  private CLIENT_ID = environment.CLIENT_ID;
  private SCOPES = environment.SCOPES;
  private accessToken: string | null = null;
  private tokenClient: any;

  /** Initialize Google API client */
  async initGoogleAPI(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const g = window as any;
      if (!g.gapi) {
        return reject('Google API not loaded');
      }

      g.gapi.load('client', async () => {
        try {
          await g.gapi.client.init({
            apiKey: this.API_KEY,
            discoveryDocs: [
              'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
            ],
          });
          this.initTokenClient();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /** Initialize OAuth2 token client */
  private initTokenClient() {
    const google = (window as any).google;
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.SCOPES,
      callback: (response: any) => {
        if (response && response.access_token) {
          this.accessToken = response.access_token;
        }
      },
    });
  }

  /** Request access token if not present */
  async ensureAccessToken(): Promise<void> {
    if (!this.accessToken) {
      await this.initGoogleAPI();
      await new Promise<void>((resolve) => {
        this.tokenClient.callback = (resp: any) => {
          this.accessToken = resp.access_token;
          resolve();
        };
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      });
    }
  }

  /** Upload file (Blob) to Google Drive */
  async uploadFile(blob: Blob, fileName: string): Promise<string> {
    await this.ensureAccessToken();
    if (!this.accessToken) throw new Error('No access token found.');

    const metadata = {
      name: fileName,
      mimeType: 'image/png',
    };

    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', blob);

    // Upload file
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: new Headers({ Authorization: 'Bearer ' + this.accessToken }),
        body: form,
      }
    );

    const file = await res.json();

    // Make file public
    await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
      method: 'POST',
      headers: new Headers({
        Authorization: 'Bearer ' + this.accessToken,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    // Return public URL
    return `https://drive.google.com/uc?export=view&id=${file.id}`;
  }
}
