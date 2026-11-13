import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// The bucket is private. Fetch only the authenticated user's own profile
// and create a revocable in-memory URL rather than exposing a public photo URL.
export default function ProfileAvatar({ name }: { name: string }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let disposed = false;
    let requestVersion = 0;
    let ownedUrl: string | null = null;

    function clearPhoto() {
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
      ownedUrl = null;
      setPhotoUrl(null);
    }

    async function loadPhoto() {
      const request = ++requestVersion;
      try {
        const auth = await client.auth.getUser();
        if (disposed || request !== requestVersion) return;
        if (auth.error || !auth.data.user) { clearPhoto(); return; }

        const profile = await client.from('dli_member_profiles')
          .select('avatar_path')
          .eq('user_id', auth.data.user.id)
          .maybeSingle();
        if (disposed || request !== requestVersion) return;
        const path = profile.data?.avatar_path;
        if (profile.error || !path) { clearPhoto(); return; }

        const image = await client.storage.from('dli-member-avatars').download(path);
        if (disposed || request !== requestVersion) return;
        if (image.error || !image.data) { clearPhoto(); return; }

        const nextUrl = URL.createObjectURL(image.data);
        const previous = ownedUrl;
        ownedUrl = nextUrl;
        setPhotoUrl(nextUrl);
        if (previous) URL.revokeObjectURL(previous);
      } catch {
        if (!disposed && request === requestVersion) clearPhoto();
      }
    }

    void loadPhoto();
    // My profile emits this after an upload or replacement is saved.
    window.addEventListener('dli-profile-changed', loadPhoto);
    return () => {
      disposed = true;
      ++requestVersion;
      window.removeEventListener('dli-profile-changed', loadPhoto);
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, []);

  return <span className="profile-placeholder">
    {photoUrl
      ? <img src={photoUrl} alt="Your profile photo" onError={() => setPhotoUrl(null)} />
      : (name.trim().charAt(0).toUpperCase() || 'D')}
  </span>;
}
