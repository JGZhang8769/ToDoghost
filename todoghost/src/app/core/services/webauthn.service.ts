import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WebAuthnService {

  private abortController: AbortController | null = null;

  // Helper to generate a random challenge
  private generateChallenge(): Uint8Array {
    return window.crypto.getRandomValues(new Uint8Array(32));
  }

  // Check if WebAuthn is supported
  isWebAuthnSupported(): boolean {
    return !!window.PublicKeyCredential;
  }

  // Register a new Face ID / Touch ID credential
  // Cancel any ongoing WebAuthn request
  cancelRequest() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async registerCredential(userId: string, username: string): Promise<string | null> {
    if (!this.isWebAuthnSupported()) return null;

    // Reset abort controller for new request
    this.cancelRequest();
    this.abortController = new AbortController();

    try {
      const challenge = this.generateChallenge();
      const userIdBuffer = new TextEncoder().encode(userId);

      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: 'ToDoghost',
        },
        user: {
          id: userIdBuffer,
          name: username,
          displayName: username
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },  // ES256
          { type: 'public-key', alg: -257 } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Enforce local device (Face ID/Touch ID)
          userVerification: 'required'
        },
        timeout: 30000,
      };

      const credential = await navigator.credentials.create({
        publicKey,
        signal: this.abortController.signal
      }) as PublicKeyCredential;

      if (credential) {
        // Save mapping of userId -> credentialId in localStorage
        const credentialIdBase64 = this.arrayBufferToBase64(credential.rawId);
        localStorage.setItem(`webauthn_credential_${userId}`, credentialIdBase64);
        return credentialIdBase64;
      }
      return null;
    } catch (error) {
      console.error('WebAuthn Registration Error:', error);
      return null;
    }
  }

  // Authenticate using an existing credential
  async authenticate(userId: string): Promise<boolean> {
    if (!this.isWebAuthnSupported()) return false;

    const savedCredentialIdBase64 = localStorage.getItem(`webauthn_credential_${userId}`);
    if (!savedCredentialIdBase64) return false;

    // Reset abort controller for new request
    this.cancelRequest();
    this.abortController = new AbortController();

    try {
      const challenge = this.generateChallenge();
      const credentialIdBuffer = this.base64ToArrayBuffer(savedCredentialIdBase64);

      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge,
        allowCredentials: [{
          type: 'public-key',
          id: credentialIdBuffer,
          transports: ['internal']
        }],
        userVerification: 'required',
        timeout: 30000,
      };

      const assertion = await navigator.credentials.get({
        publicKey,
        signal: this.abortController.signal
      }) as PublicKeyCredential;

      // For this frontend-only check, if we got a valid assertion, we consider it a success.
      return !!assertion;
    } catch (error) {
      console.error('WebAuthn Authentication Error:', error);
      return false;
    }
  }

  // Check if a user has a registered credential
  hasCredential(userId: string): boolean {
    return !!localStorage.getItem(`webauthn_credential_${userId}`);
  }

  // Utility to convert ArrayBuffer to Base64
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // Utility to convert Base64 to ArrayBuffer
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
