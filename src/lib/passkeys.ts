// Passkeys remain gated until production Supabase Auth Passkeys (beta)
// is enabled with the exact public relying-party ID. Password login stays.
export const dliPasskeysEnabled=import.meta.env.VITE_DLI_PASSKEYS_ENABLED==='true';
export function webAuthnSupported(){
 return dliPasskeysEnabled&&typeof window!=='undefined'&&window.isSecureContext&&
  typeof window.PublicKeyCredential!=='undefined'&&!!navigator.credentials;
}
export function passkeyError(error:unknown):string{
 const name=error instanceof Error?error.name:'';
 if(name==='NotAllowedError'||name==='AbortError')
  return 'Passkey request was cancelled or the authenticator was unavailable.';
 return 'Passkey authentication is unavailable. Check your device and contact DLI administration if passkeys are not enabled in Supabase.';
}
