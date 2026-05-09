import { HydrawiseAuthError } from '../errors.js';

const TOKEN_URL = 'https://app.hydrawise.com/api/v2/oauth/access-token';
const CLIENT_ID = 'hydrawise_app';
// Public client secret bundled in the upstream Hydrawise mobile app and the
// pydrawise reference client; not a credential we own.
const CLIENT_SECRET = 'zn3CrjglwNV1';
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface ErrorResponse {
  error: string;
  message?: string;
  error_description?: string;
}

type FetchFn = typeof fetch;

export class Auth {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenType: string | null = null;
  private expiresAt = 0;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getAuthHeader(): Promise<string> {
    if (this.shouldRefresh()) {
      await this.fetchToken(this.refreshToken !== null);
    }
    if (!this.accessToken || !this.tokenType) {
      throw new HydrawiseAuthError('failed to acquire access token');
    }
    return `${this.tokenType} ${this.accessToken}`;
  }

  private shouldRefresh(): boolean {
    if (!this.accessToken) return true;
    return this.expiresAt - this.now() < REFRESH_LEEWAY_MS;
  }

  private async fetchToken(refresh: boolean): Promise<void> {
    if (this.inFlight) {
      await this.inFlight;
      return;
    }
    this.inFlight = this.fetchTokenLocked(refresh).finally(() => {
      this.inFlight = null;
    });
    await this.inFlight;
  }

  private async fetchTokenLocked(refresh: boolean): Promise<void> {
    const params = new URLSearchParams();
    params.set('client_id', CLIENT_ID);
    params.set('client_secret', CLIENT_SECRET);
    if (refresh && this.refreshToken) {
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', this.refreshToken);
    } else {
      params.set('grant_type', 'password');
      params.set('scope', 'all');
      params.set('username', this.username);
      params.set('password', this.password);
    }

    let response: Response;
    try {
      response = await this.fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } catch (err) {
      this.clearToken();
      throw new HydrawiseAuthError('network error contacting Hydrawise auth endpoint', {
        cause: err,
      });
    }

    let body: TokenResponse | ErrorResponse;
    try {
      body = (await response.json()) as TokenResponse | ErrorResponse;
    } catch (err) {
      this.clearToken();
      throw new HydrawiseAuthError('Hydrawise auth endpoint returned non-JSON response', {
        cause: err,
      });
    }

    if (!response.ok || 'error' in body) {
      this.clearToken();
      const errBody = body as ErrorResponse;
      const detail =
        errBody.message ?? errBody.error_description ?? errBody.error ?? response.statusText;
      throw new HydrawiseAuthError(`Hydrawise auth failed: ${detail}`);
    }

    const ok = body as TokenResponse;
    this.accessToken = ok.access_token;
    this.refreshToken = ok.refresh_token;
    this.tokenType = ok.token_type;
    this.expiresAt = this.now() + ok.expires_in * 1000;
  }

  private clearToken(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenType = null;
    this.expiresAt = 0;
  }
}
